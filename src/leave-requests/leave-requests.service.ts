import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { UpdateLeaveStatusDto } from './dto/update-leave-status.dto';
import { EncryptionService } from '../common/encryption.service';

@Injectable()
export class LeaveRequestsService {
    constructor(
        private prisma: PrismaService,
        private encryption: EncryptionService
    ) { }

    async create(userId: number, dto: CreateLeaveRequestDto) {
        // --- LUẬT MỚI: KIỂM TRA THỜI GIAN BÁO TRƯỚC ---
        const now = new Date();
        const leaveStartDate = new Date(dto.start_date);

        // Tính khoảng cách thời gian từ hiện tại đến ngày bắt đầu nghỉ (tính bằng giờ)
        const diffInMilliseconds = leaveStartDate.getTime() - now.getTime();
        const diffInHours = diffInMilliseconds / (1000 * 60 * 60);

        if (dto.type_code === 'SICK') {
            if (diffInHours < 6) {
                throw new BadRequestException('Nghỉ ốm (SICK) phải được báo trước ít nhất 6 tiếng.');
            }
        } else {
            // STANDARD hoặc các loại khác
            if (diffInHours < 24) {
                throw new BadRequestException('Nghỉ phép thông thường phải được báo trước ít nhất 24 tiếng.');
            }
        }
        // ----------------------------------------------
        // Rule 1: Overlap Prevention
        const overlap = await this.prisma.leave_requests.findFirst({
            where: {
                user_id: userId,
                status_code: { in: ['PENDING', 'APPROVED'] },
                OR: [
                    {
                        start_date: { lte: new Date(dto.end_date) },
                        end_date: { gte: new Date(dto.start_date) },
                    },
                ],
            },
        });

        if (overlap) {
            throw new BadRequestException('Thời gian nghỉ phép bị trùng lặp với một yêu cầu hiện có.');
        }

        // Rule 3: Sick Leave Exception
        if (dto.type_code === 'SICK') {
            return this.prisma.leave_requests.create({
                data: {
                    user_id: userId,
                    type_code: dto.type_code,
                    start_date: new Date(dto.start_date),
                    end_date: new Date(dto.end_date),
                    reason: dto.reason,
                    evidence_url: dto.evidence_url,
                    status_code: 'PENDING',
                },
            });
        }

        // Rule 2: Auto-Categorization & Auto-Splitting (For STANDARD)
        if (dto.type_code === 'STANDARD') {
            const employee = await this.prisma.employees.findUnique({
                where: { user_id: userId },
            });

            if (!employee || !employee.start_date) {
                // Cannot calculate balance
                return this.prisma.leave_requests.create({
                    data: {
                        user_id: userId,
                        type_code: 'UNPAID',
                        start_date: new Date(dto.start_date),
                        end_date: new Date(dto.end_date),
                        reason: dto.reason,
                        evidence_url: dto.evidence_url,
                        status_code: 'PENDING',
                    },
                });
            }

            // Calculate total accumulated days
            const startDate = new Date(employee.start_date);
            const now = new Date();
            let monthsWorked = (now.getFullYear() - startDate.getFullYear()) * 12 + now.getMonth() - startDate.getMonth();
            if (now.getDate() < startDate.getDate()) {
                monthsWorked--;
            }
            if (monthsWorked < 0) monthsWorked = 0;
            const totalAccumulatedDays = monthsWorked;

            // Calculate used ANNUAL_PAID days
            const usedLeaves = await this.prisma.leave_requests.findMany({
                where: {
                    user_id: userId,
                    type_code: 'ANNUAL_PAID',
                    status_code: 'APPROVED',
                },
            });

            let usedDays = 0;
            for (const leave of usedLeaves) {
                const start = new Date(leave.start_date);
                const end = new Date(leave.end_date);
                const diffTime = Math.abs(end.getTime() - start.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive
                usedDays += diffDays;
            }

            const balance = totalAccumulatedDays - usedDays;

            const startReq = new Date(dto.start_date);
            const endReq = new Date(dto.end_date);
            const reqDiffTime = Math.abs(endReq.getTime() - startReq.getTime());
            const requestedDays = Math.ceil(reqDiffTime / (1000 * 60 * 60 * 24)) + 1;

            if (balance <= 0) {
                return this.prisma.leave_requests.create({
                    data: {
                        user_id: userId,
                        type_code: 'UNPAID',
                        start_date: startReq,
                        end_date: endReq,
                        reason: dto.reason,
                        status_code: 'PENDING',
                    },
                });
            }

            if (requestedDays <= balance) {
                return this.prisma.leave_requests.create({
                    data: {
                        user_id: userId,
                        type_code: 'ANNUAL_PAID',
                        start_date: startReq,
                        end_date: endReq,
                        reason: dto.reason,
                        status_code: 'PENDING',
                    },
                });
            }

            // Case 3: Auto-split
            const recordADays = balance;
            // record A: startReq -> startReq + recordADays - 1
            const recordAEnd = new Date(startReq);
            recordAEnd.setDate(recordAEnd.getDate() + recordADays - 1);

            const recordBStart = new Date(recordAEnd);
            recordBStart.setDate(recordBStart.getDate() + 1);

            const result = await this.prisma.$transaction([
                this.prisma.leave_requests.create({
                    data: {
                        user_id: userId,
                        type_code: 'ANNUAL_PAID',
                        start_date: startReq,
                        end_date: recordAEnd,
                        reason: dto.reason,
                        status_code: 'PENDING',
                    }
                }),
                this.prisma.leave_requests.create({
                    data: {
                        user_id: userId,
                        type_code: 'UNPAID',
                        start_date: recordBStart,
                        end_date: endReq,
                        reason: dto.reason,
                        status_code: 'PENDING',
                    }
                })
            ]);

            return result[0];
        }

        // Default fallback (e.g. UNPAID)
        return this.prisma.leave_requests.create({
            data: {
                user_id: userId,
                type_code: dto.type_code,
                start_date: new Date(dto.start_date),
                end_date: new Date(dto.end_date),
                reason: dto.reason,
                status_code: 'PENDING',
            },
        });
    }

    async getMyLeaves(userId: number) {
        return this.prisma.leave_requests.findMany({
            where: { user_id: userId },
            orderBy: { created_at: 'desc' },
        });
    }

    // Tìm hàm getAllLeaves và sửa lại thành:
    async getAllLeaves(status?: string) {
        // Tạo điều kiện lọc động
        const whereClause: any = {};
        if (status) {
            whereClause.status_code = status;
        }

        const leaves = await this.prisma.leave_requests.findMany({
            where: whereClause, // Nạp điều kiện lọc vào đây
            include: {
                employees: {
                    include: {
                        users: {
                            select: {
                                full_name: true,
                                email: true,
                                phone: true
                            }
                        }
                    }
                }
            },
            orderBy: { created_at: 'desc' },
        });

        // Giải mã Email và Số điện thoại nhân viên
        return leaves.map(req => {
            const user = req.employees?.users;
            if (user) {
                if (user.email) {
                    user.email = this.encryption.decrypt(user.email);
                }
                if (user.phone) {
                    user.phone = this.encryption.decrypt(user.phone);
                }
            }
            return req;
        });
    }
    async updateStatus(id: number, dto: UpdateLeaveStatusDto) {
        const leaveRequest = await this.prisma.leave_requests.findUnique({
            where: { request_id: id }
        });

        if (!leaveRequest) {
            throw new BadRequestException('Không tìm thấy yêu cầu nghỉ phép này');
        }

        // 1. Cập nhật trạng thái của đơn nghỉ phép
        const updated = await this.prisma.leave_requests.update({
            where: { request_id: id },
            data: { status_code: dto.status_code },
        });

        // 2. Lấy danh sách các ca làm việc nằm trong khoảng thời gian xin nghỉ
        const affectedSchedules = await this.prisma.work_schedules.findMany({
            where: {
                user_id: leaveRequest.user_id,
                date: {
                    gte: leaveRequest.start_date,
                    lte: leaveRequest.end_date
                }
            }
        });

        if (affectedSchedules.length > 0) {
            const scheduleIds = affectedSchedules.map(s => s.schedule_id);

            // Xử lý logic xóa mềm / khôi phục bằng Transaction để đảm bảo an toàn dữ liệu
            if (dto.status_code === 'APPROVED') {
                // Rule 4: Anti-ABSENT Trap - Xóa ca làm để không bị tính vắng mặt
                await this.prisma.$transaction([
                    this.prisma.work_schedules.updateMany({
                        where: { schedule_id: { in: scheduleIds } },
                        data: { deleted_at: new Date() }
                    }),
                    this.prisma.timesheets.updateMany({
                        where: { schedule_id: { in: scheduleIds } },
                        data: { deleted_at: new Date() }
                    })
                ]);
            } else if (dto.status_code === 'REJECTED') {
                // Hồi sinh (Revert) ca làm nếu đơn bị từ chối
                await this.prisma.$transaction([
                    this.prisma.work_schedules.updateMany({
                        where: { schedule_id: { in: scheduleIds } },
                        data: { deleted_at: null }
                    }),
                    this.prisma.timesheets.updateMany({
                        where: { schedule_id: { in: scheduleIds } },
                        data: { deleted_at: null }
                    })
                ]);
            }
        }

        return updated;
    }
}
