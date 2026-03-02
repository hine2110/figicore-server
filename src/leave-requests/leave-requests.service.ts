import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { UpdateLeaveStatusDto } from './dto/update-leave-status.dto';

@Injectable()
export class LeaveRequestsService {
    constructor(private prisma: PrismaService) { }

    async create(userId: number, dto: CreateLeaveRequestDto) {
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

    async getAllLeaves() {
        return this.prisma.leave_requests.findMany({
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
    }

    async updateStatus(id: number, dto: UpdateLeaveStatusDto) {
        const leaveRequest = await this.prisma.leave_requests.findUnique({
            where: { request_id: id }
        });

        if (!leaveRequest) {
            throw new BadRequestException('Không tìm thấy yêu cầu nghỉ phép này');
        }

        const updated = await this.prisma.leave_requests.update({
            where: { request_id: id },
            data: { status_code: dto.status_code },
        });

        // Rule 4: Anti-ABSENT Trap via Schedule Deletion
        if (dto.status_code === 'APPROVED') {
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
                await this.prisma.$transaction([
                    // Soft delete schedules by marking deleted_at
                    this.prisma.work_schedules.updateMany({
                        where: {
                            schedule_id: { in: scheduleIds }
                        },
                        data: {
                            deleted_at: new Date()
                        }
                    }),
                    // Also soft delete timesheets related to these schedules
                    this.prisma.timesheets.updateMany({
                        where: {
                            schedule_id: { in: scheduleIds }
                        },
                        data: {
                            deleted_at: new Date()
                        }
                    })
                ]);
            }
        }

        return updated;
    }
}
