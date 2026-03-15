import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCorrectionDto } from './dto/create-correction.dto';
import { ReviewCorrectionDto } from './dto/review-correction.dto';

@Injectable()
export class TimesheetCorrectionsService {
    constructor(private prisma: PrismaService) { }

    // STAFF: Tạo khiếu nại
    async create(userId: number, dto: CreateCorrectionDto) {
        const timesheet = await this.prisma.timesheets.findUnique({
            where: { timesheet_id: dto.timesheet_id },
            include: { work_schedules: true }
        });

        if (!timesheet || timesheet.work_schedules?.user_id !== userId) {
            throw new ForbiddenException('Bạn không có quyền khiếu nại ca làm này.');
        }

        // --- LUẬT MỚI (HƯỚNG 1): CHỈ CHO PHÉP KHIẾU NẠI KHI CA ĐÃ KẾT THÚC ---
        const hasCheckedOut = timesheet.check_out_at !== null;
        const expectedEnd = timesheet.work_schedules?.expected_end;

        if (!hasCheckedOut) {
            if (!expectedEnd) {
                throw new BadRequestException('Ca làm này chưa có dữ liệu kết thúc hợp lệ.');
            }

            // Tính toán mốc "Chết ca" (Giờ kết thúc dự kiến + 15 phút)
            const overdueTime = new Date(expectedEnd.getTime() + 15 * 60 * 1000);
            const now = new Date();

            // NẾU chưa check-out VÀ thời gian hiện tại vẫn chưa qua mốc chết ca -> Chặn!
            if (now <= overdueTime) {
                throw new BadRequestException('Bạn chỉ có thể gửi khiếu nại khi ca làm đã hoàn tất (đã check-out) hoặc đã qua hạn chốt ca (quá 15p sau giờ kết thúc).');
            }
        }

        // LUẬT MỚI: Mỗi ca làm CHỈ ĐƯỢC khiếu nại 1 lần duy nhất (Bất kể PENDING, APPROVED hay REJECTED)
        const existing = await this.prisma.timesheet_corrections.findFirst({
            where: { timesheet_id: dto.timesheet_id } // Xóa điều kiện status_code
        });
        if (existing) throw new BadRequestException('Bạn đã gửi khiếu nại cho ca làm này rồi. Mỗi ca chỉ được quyền báo lỗi 1 lần duy nhất!');

        return this.prisma.timesheet_corrections.create({
            data: {
                timesheet_id: dto.timesheet_id,
                user_id: userId,
                reason: dto.reason,
                evidence_url: dto.evidence_url,
                status_code: 'PENDING'
            }
        });
    }

    // MANAGER: Duyệt/Từ chối khiếu nại
    async review(reviewerId: number, correctionId: number, dto: ReviewCorrectionDto) {
        const correction = await this.prisma.timesheet_corrections.findUnique({
            where: { correction_id: correctionId }
        });

        if (!correction || correction.status_code !== 'PENDING') {
            throw new BadRequestException('Không tìm thấy khiếu nại hoặc đã được xử lý.');
        }

        return this.prisma.$transaction(async (tx) => {
            // 1. Cập nhật đơn khiếu nại
            const updatedCorrection = await tx.timesheet_corrections.update({
                where: { correction_id: correctionId },
                data: {
                    status_code: dto.status_code,
                    manager_note: dto.manager_note,
                    reviewer_id: reviewerId,
                    updated_at: new Date()
                }
            });

            // 2. Nếu quản lý quyết định thay đổi giờ làm thực tế của ca đó
            if (dto.adjusted_hours !== undefined || dto.adjusted_status !== undefined) {
                const updateData: any = { updated_at: new Date() };
                if (dto.adjusted_hours !== undefined) updateData.real_work_hours = dto.adjusted_hours;
                if (dto.adjusted_status !== undefined) updateData.status_code = dto.adjusted_status;

                await tx.timesheets.update({
                    where: { timesheet_id: correction.timesheet_id },
                    data: updateData
                });
            }

            return updatedCorrection;
        });
    }

    // Thêm vào cuối file Service
    // STAFF: Xem lịch sử khiếu nại của chính mình
    async getMyCorrections(userId: number) {
        return this.prisma.timesheet_corrections.findMany({
            where: { user_id: userId },
            include: {
                timesheets: {
                    include: { work_schedules: true }
                },
                reviewer: {
                    select: { users: { select: { full_name: true } } }
                }
            },
            orderBy: { created_at: 'desc' }
        });
    }

    // MANAGER/ADMIN: Lấy danh sách khiếu nại (có thể lọc theo trạng thái)
    async getAllCorrections(status?: string) {
        const whereClause: any = {};
        if (status) {
            whereClause.status_code = status;
        }

        return this.prisma.timesheet_corrections.findMany({
            where: whereClause,
            include: {
                timesheets: {
                    include: { work_schedules: true }
                },
                employees: {
                    select: { users: { select: { full_name: true, email: true } } }
                }
            },
            orderBy: { created_at: 'desc' }
        });
    }
}