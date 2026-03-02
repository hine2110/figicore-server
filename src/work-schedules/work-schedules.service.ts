import { BadRequestException, Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateWorkScheduleDto } from './dto/create-work-schedule.dto';
import { CloneWorkScheduleDto } from './dto/clone-work-schedule.dto';
import { GetSchedulesFilterDto } from './dto/get-schedules-filter.dto';
import { UpdateWorkScheduleDto } from './dto/update-work-schedule.dto';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Ho_Chi_Minh');

@Injectable()
export class WorkSchedulesService {
    constructor(private readonly prisma: PrismaService) { }

    async create(createWorkScheduleDto: CreateWorkScheduleDto) {
        const { user_id, date, shift_code } = createWorkScheduleDto;

        // 1. Define Standard Shift Times (Server Enforcement)
        const shiftTimes: Record<string, { start: number; end: number }> = {
            'MORNING': { start: 8, end: 12 },
            'AFTERNOON': { start: 13, end: 17 },
            'EVENING': { start: 17, end: 21 },
        };

        const config = shiftTimes[shift_code];
        if (!config) {
            // Fallback: Check DB if not in hardcoded list (optional, but requested Strict Adherence)
            // For this task, we enforce the 3 shifts strictly as per requirement.
            throw new BadRequestException(`Invalid shift code: ${shift_code}. Must be MORNING, AFTERNOON, or EVENING.`);
        }

        // Validate shift_code exists in system_lookups (Data Integrity)
        const validShift = await this.prisma.system_lookups.findFirst({
            where: {
                type: 'SHIFT_CODE',
                code: shift_code,
                deleted_at: null,
            },
        });

        if (!validShift) {
            throw new BadRequestException(`Invalid shift code in system: ${shift_code}`);
        }

        // Check for existing schedule to prevent duplicates
        const existingSchedule = await this.prisma.work_schedules.findFirst({
            where: {
                user_id,
                date: new Date(date),
                shift_code,
                deleted_at: null,
            },
        });

        if (existingSchedule) {
            throw new ConflictException(
                `Schedule already exists for user ${user_id} on ${date} with shift ${shift_code}`,
            );
        }

        // Convert date string to Date object
        const scheduleDate = new Date(date);

        // 2. Set Expected Start/End Time based on Shift Config (Force Asia/Ho_Chi_Minh +07:00)
        // Format: YYYY-MM-DDTHH:mm:ss+07:00
        const formatTime = (h: number) => h.toString().padStart(2, '0');

        const expected_start = new Date(0); // Epoch
        expected_start.setUTCHours(config.start, 0, 0, 0);
        const expected_end = new Date(0);
        expected_end.setUTCHours(config.end, 0, 0, 0);

        return this.prisma.work_schedules.create({
            data: {
                user_id,
                date: scheduleDate,
                shift_code,
                expected_start,
                expected_end,
            },
        });
    }

    async createBulk(dtos: CreateWorkScheduleDto[]) {
        const results: any[] = [];
        const errors: { user_id: number; date: string; error: any }[] = [];

        for (const dto of dtos) {
            try {
                // Tận dụng hàm create lẻ để giữ nguyên logic kiểm tra trùng lặp và validate
                const res = await this.create(dto);
                results.push(res);
            } catch (error) {
                // Nếu lỗi, ghi lại để báo cáo chứ không dừng toàn bộ quá trình
                errors.push({
                    user_id: dto.user_id,
                    date: dto.date,
                    error: error.message
                });
            }
        }

        return {
            message: 'Bulk create process finished',
            success_count: results.length,
            error_count: errors.length,
            successful_records: results,
            failed_records: errors,
        };
    }

    async clone(cloneWorkScheduleDto: CloneWorkScheduleDto) {
        const { source_date, target_date } = cloneWorkScheduleDto;
        const source = new Date(source_date);
        const target = new Date(target_date);

        // 1. Query all schedules from source date
        const sourceSchedules = await this.prisma.work_schedules.findMany({
            where: {
                date: source,
                deleted_at: null,
            },
        });

        if (sourceSchedules.length === 0) {
            throw new BadRequestException(`No schedules found for source date: ${source_date}`);
        }

        let createdCount = 0;
        let skippedCount = 0;

        // 2. Iterate and copy
        const existingTargetSchedules = await this.prisma.work_schedules.findMany({
            where: {
                date: target,
                deleted_at: null,
            },
            select: {
                user_id: true,
                shift_code: true,
            },
        });

        // Create a Set for quick lookup of existing target schedules "userId-shiftCode"
        const existingSet = new Set(
            existingTargetSchedules.map((s) => `${s.user_id}-${s.shift_code}`),
        );

        // Explicitly type the array using Prisma generated types
        // Note: The model name is work_schedules, so the type should be work_schedulesCreateManyInput
        const newSchedulesData: Prisma.work_schedulesCreateManyInput[] = [];

        for (const schedule of sourceSchedules) {
            const key = `${schedule.user_id}-${schedule.shift_code}`;

            if (existingSet.has(key)) {
                skippedCount++;
                continue;
            }

            // Prepare date times for the new day
            let newStart: Date | null = null;
            let newEnd: Date | null = null;

            if (schedule.expected_start) {
                newStart = new Date(target);
                newStart.setHours(schedule.expected_start.getHours());
                newStart.setMinutes(schedule.expected_start.getMinutes());
                newStart.setSeconds(schedule.expected_start.getSeconds());
            }

            if (schedule.expected_end) {
                newEnd = new Date(target);
                newEnd.setHours(schedule.expected_end.getHours());
                newEnd.setMinutes(schedule.expected_end.getMinutes());
                newEnd.setSeconds(schedule.expected_end.getSeconds());
            }

            newSchedulesData.push({
                user_id: schedule.user_id,
                date: target,
                shift_code: schedule.shift_code,
                expected_start: newStart,
                expected_end: newEnd,
            });
        }

        if (newSchedulesData.length > 0) {
            // 3. Batch insert
            await this.prisma.work_schedules.createMany({
                data: newSchedulesData,
            });
            createdCount = newSchedulesData.length;
        }

        return {
            message: 'Clone completed',
            source_date,
            target_date,
            found_source: sourceSchedules.length,
            created: createdCount,
            skipped_duplicates: skippedCount,
        };
    }

    async update(id: number, updateWorkScheduleDto: UpdateWorkScheduleDto) {
        // 1. Check if schedule exists
        const existingSchedule = await this.prisma.work_schedules.findFirst({
            where: {
                schedule_id: id,
                deleted_at: null,
            },
        });

        if (!existingSchedule) {
            throw new NotFoundException(`Work schedule with ID ${id} not found`);
        }

        const { user_id, date, shift_code, expected_start, expected_end } = updateWorkScheduleDto;

        // 2. Conflict Check if key fields are updated
        if (user_id || date || shift_code) {
            const checkUserId = user_id ?? existingSchedule.user_id;
            const checkDate = date ? new Date(date) : existingSchedule.date;
            const checkShiftCode = shift_code ?? existingSchedule.shift_code;

            const duplicate = await this.prisma.work_schedules.findFirst({
                where: {
                    user_id: checkUserId,
                    date: checkDate,
                    shift_code: checkShiftCode,
                    deleted_at: null,
                    schedule_id: { not: id }, // Exclude current record
                },
            });

            if (duplicate) {
                throw new ConflictException(
                    `Schedule already exists for user ${checkUserId} on ${checkDate.toISOString().split('T')[0]} with shift ${checkShiftCode}`,
                );
            }
        }

        // 3. Prepare data for update
        const dataToUpdate: any = { ...updateWorkScheduleDto };

        // Handle Date conversions
        if (date) {
            dataToUpdate.date = new Date(date);
        }
        if (expected_start) {
            dataToUpdate.expected_start = new Date(expected_start);
        }
        if (expected_end) {
            dataToUpdate.expected_end = new Date(expected_end);
        }

        dataToUpdate.updated_at = new Date();

        return this.prisma.work_schedules.update({
            where: { schedule_id: id },
            data: dataToUpdate,
        });
    }

    async remove(id: number) {
        // 1. Check if schedule exists
        const existingSchedule = await this.prisma.work_schedules.findFirst({
            where: {
                schedule_id: id,
                deleted_at: null,
            },
        });

        if (!existingSchedule) {
            throw new NotFoundException(`Work schedule with ID ${id} not found`);
        }

        // 2. Soft delete
        return this.prisma.work_schedules.update({
            where: { schedule_id: id },
            data: {
                deleted_at: new Date(),
            },
        });
    }

    async findAll(filter: GetSchedulesFilterDto) {
        const { from, to } = filter;
        const where: Prisma.work_schedulesWhereInput = { deleted_at: null };

        if (from && to) {
            where.date = {
                gte: dayjs.tz(from, 'Asia/Ho_Chi_Minh').startOf('day').toDate(),
                lte: dayjs.tz(to, 'Asia/Ho_Chi_Minh').endOf('day').toDate(),
            };
        } else if (from) {
            where.date = { gte: dayjs.tz(from, 'Asia/Ho_Chi_Minh').startOf('day').toDate() };
        } else if (to) {
            where.date = { lte: dayjs.tz(to, 'Asia/Ho_Chi_Minh').endOf('day').toDate() };
        }

        return this.prisma.work_schedules.findMany({
            where,
            include: {
                employees: {
                    include: {
                        users: true,
                    },
                },
            },
            orderBy: [
                { date: 'asc' },
                { expected_start: 'asc' },
            ],
        });
    }

    async getAttendanceReport(filter: GetSchedulesFilterDto) {
        const { from, to } = filter;
        const where: Prisma.work_schedulesWhereInput = { deleted_at: null };

        if (from && to) {
            where.date = {
                gte: dayjs.tz(from, 'Asia/Ho_Chi_Minh').startOf('day').toDate(),
                lte: dayjs.tz(to, 'Asia/Ho_Chi_Minh').endOf('day').toDate(),
            };
        } else if (from) {
            where.date = { gte: dayjs.tz(from, 'Asia/Ho_Chi_Minh').startOf('day').toDate() };
        } else if (to) {
            where.date = { lte: dayjs.tz(to, 'Asia/Ho_Chi_Minh').endOf('day').toDate() };
        }

        const schedules = await this.prisma.work_schedules.findMany({
            where,
            include: {
                employees: {
                    include: {
                        users: true,
                    },
                },
                timesheets: true,
            },
        });

        const summaryMap = new Map<number, {
            user_id: number;
            full_name: string;
            avatar_url: string;
            email: string;
            total_shifts: number;
            late_count: number;
            early_leave_count: number;
            missing_count: number;
            absent_count: number;
        }>();

        const todayZero = dayjs().tz('Asia/Ho_Chi_Minh').startOf('day').toDate();

        for (const schedule of schedules) {
            const userId = schedule.user_id;
            const employee = schedule.employees;
            const user = employee?.users;

            if (!user) continue;

            if (!summaryMap.has(userId)) {
                summaryMap.set(userId, {
                    user_id: userId,
                    full_name: user.full_name,
                    avatar_url: user.avatar_url || '',
                    email: user.email || '',
                    total_shifts: 0,
                    late_count: 0,
                    early_leave_count: 0,
                    missing_count: 0,
                    absent_count: 0,
                });
            }

            const entry = summaryMap.get(userId);
            if (entry) {
                entry.total_shifts += 1;

                // Evaluate the timesheet
                // Assuming one timesheet per schedule or taking the first one as per requirement
                const timesheet = schedule.timesheets && schedule.timesheets.length > 0 ? schedule.timesheets[0] : null;

                if (timesheet) {
                    switch (timesheet.status_code) {
                        case 'LATE':
                            entry.late_count += 1;
                            break;
                        case 'EARLY_LEAVE':
                            entry.early_leave_count += 1;
                            break;
                        case 'MISSING':
                            entry.missing_count += 1;
                            break;
                        case 'ABSENT':
                            entry.absent_count += 1;
                            break;
                    }
                } else {
                    const scheduleDate = new Date(schedule.date);
                    if (scheduleDate < todayZero) {
                        entry.absent_count += 1;
                    }
                }
            }
        }

        return Array.from(summaryMap.values());
    }
}
