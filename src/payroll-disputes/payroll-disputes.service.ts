import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { ReplyDisputeDto } from './dto/reply-dispute.dto';

@Injectable()
export class PayrollDisputesService {
    constructor(private prisma: PrismaService) { }

    // STAFF: Tạo khiếu nại
    async create(userId: number, dto: CreateDisputeDto) {
        const payroll = await this.prisma.payrolls.findUnique({
            where: { payroll_id: dto.payroll_id }
        });

        if (!payroll || payroll.user_id !== userId) {
            throw new ForbiddenException('Bạn không có quyền khiếu nại phiếu lương này.');
        }

        // Chỉ cho phép khiếu nại khi phiếu lương đang được review hoặc chờ duyệt
        if (payroll.status_code === 'DRAFT' || payroll.status_code === 'PAID') {
            throw new BadRequestException('Không thể khiếu nại phiếu lương ở trạng thái Nháp hoặc Đã thanh toán.');
        }

        // Chống spam: Mỗi phiếu lương chỉ được tạo 1 ticket khiếu nại (bất kể trạng thái ticket)
        const existingDispute = await this.prisma.payroll_disputes.findFirst({
            where: { payroll_id: dto.payroll_id }
        });
        if (existingDispute) {
            throw new BadRequestException('Bạn đã gửi khiếu nại cho phiếu lương này rồi. Quản lý đang xem xét.');
        }

        return this.prisma.$transaction(async (tx) => {
            // 1. Tạo đơn khiếu nại
            const dispute = await tx.payroll_disputes.create({
                data: {
                    payroll_id: dto.payroll_id,
                    user_id: userId,
                    content: dto.content,
                    status_code: 'OPEN'
                }
            });

            // 2. Đóng băng phiếu lương (Chuyển sang DISPUTED)
            await tx.payrolls.update({
                where: { payroll_id: dto.payroll_id },
                data: { status_code: 'DISPUTED' }
            });

            return dispute;
        });
    }

    // STAFF: Xem các khiếu nại của mình
    async getMyDisputes(userId: number) {
        return this.prisma.payroll_disputes.findMany({
            where: { user_id: userId },
            include: {
                payrolls: { select: { month: true, year: true, final_salary: true, status_code: true } }
            },
            orderBy: { created_at: 'desc' }
        });
    }

    // MANAGER/ADMIN: Xem toàn bộ khiếu nại
    async getAllDisputes(status?: string) {
        const whereClause: any = {};
        if (status) whereClause.status_code = status;

        return this.prisma.payroll_disputes.findMany({
            where: whereClause,
            include: {
                employees: { select: { users: { select: { full_name: true, email: true } } } },
                payrolls: { select: { month: true, year: true, final_salary: true, status_code: true } }
            },
            orderBy: { created_at: 'desc' }
        });
    }

    // MANAGER/ADMIN: Trả lời và chốt khiếu nại
    async replyToDispute(disputeId: number, dto: ReplyDisputeDto) {
        const dispute = await this.prisma.payroll_disputes.findUnique({
            where: { dispute_id: disputeId }
        });

        if (!dispute) {
            throw new NotFoundException('Không tìm thấy khiếu nại này.');
        }

        return this.prisma.payroll_disputes.update({
            where: { dispute_id: disputeId },
            data: {
                response: dto.response,
                status_code: dto.status_code,
                updated_at: new Date()
            }
        });
        // Lưu ý: Sau khi giải quyết xong, Manager sẽ dùng API đổi trạng thái lương (ở module payroll) 
        // để mở khóa phiếu lương từ DISPUTED sang PENDING_APPROVAL hoặc tính lại lương.
    }
}