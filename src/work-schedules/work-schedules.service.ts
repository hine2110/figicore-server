import { BadRequestException, Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateWorkScheduleDto } from './dto/create-work-schedule.dto';
import { CloneWorkScheduleDto } from './dto/clone-work-schedule.dto';
import { GetSchedulesFilterDto } from './dto/get-schedules-filter.dto';
import { UpdateWorkScheduleDto } from './dto/update-work-schedule.dto';

@Injectable()
export class WorkSchedulesService {
    constructor(private readonly prisma: PrismaService) { }

    async create(createWorkScheduleDto: CreateWorkScheduleDto) {
        const { user_id, date, shift_code, expected_start, expected_end } = createWorkScheduleDto;

        // Validate shift_code exists in system_lookups
        // TODO: Cache this lookup for performance
        const validShift = await this.prisma.system_lookups.findFirst({
            where: {
                type: 'SHIFT_CODE',
                code: shift_code,
                deleted_at: null,
            },
        });

        if (!validShift) {
            throw new BadRequestException(`Invalid shift code: ${shift_code}`);
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

        return this.prisma.work_schedules.create({
            data: {
                user_id,
                date: scheduleDate,
                shift_code,
                expected_start: expected_start ? new Date(expected_start) : null,
                expected_end: expected_end ? new Date(expected_end) : null,
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
                gte: new Date(from),
                lte: new Date(to),
            };
        } else if (from) {
            where.date = { gte: new Date(from) };
        } else if (to) {
            where.date = { lte: new Date(to) };
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

    async getSummary(filter: GetSchedulesFilterDto) {
        const schedules = await this.findAll(filter);

        const summaryMap = new Map<number, {
            user_id: number;
            full_name: string;
            avatar_url: string;
            total_shifts: number;
            total_hours: number;
        }>();

        for (const schedule of schedules) {
            const userId = schedule.user_id;
            // Access nested relation safely
            const employee = schedule.employees;
            const user = employee?.users;

            if (!user) continue;

            if (!summaryMap.has(userId)) {
                summaryMap.set(userId, {
                    user_id: userId,
                    full_name: user.full_name,
                    avatar_url: user.avatar_url || '',
                    total_shifts: 0,
                    total_hours: 0,
                });
            }

            const entry = summaryMap.get(userId);
            if (entry) {
                entry.total_shifts += 1;

                if (schedule.expected_start && schedule.expected_end) {
                    const start = new Date(schedule.expected_start).getTime();
                    const end = new Date(schedule.expected_end).getTime();
                    const durationMs = end - start;
                    // Convert to hours
                    const durationHours = durationMs / (1000 * 60 * 60);
                    entry.total_hours += durationHours;
                }
            }
        }

        // Round total hours to 1 decimal place
        return Array.from(summaryMap.values()).map(item => ({
            ...item,
            total_hours: Math.round(item.total_hours * 10) / 10,
        }));
    }
}
