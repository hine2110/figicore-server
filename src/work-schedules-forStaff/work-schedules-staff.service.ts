import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GetSchedulesFilterDto } from './dto/get-schedules-filter.dto';
import { Prisma } from '@prisma/client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Ho_Chi_Minh');

@Injectable()
export class WorkSchedulesStaffService {
    constructor(private prisma: PrismaService) { }

    private calculateHours(start: string | null, end: string | null): number {
        if (!start || !end) return 0;

        const startTime = new Date(start).getTime();
        const endTime = new Date(end).getTime();

        let durationMs = endTime - startTime;



        const durationHours = durationMs / (1000 * 60 * 60);
        return Math.round(durationHours * 10) / 10; // Round to 1 decimal
    }

    async findMySchedules(userId: number, filter: GetSchedulesFilterDto) {
        const where: Prisma.work_schedulesWhereInput = {
            user_id: userId,
            deleted_at: null,
            ...(filter.include_pending === 'true' ? {} : {
                OR: [
                    { status_code: 'PUBLISHED' },
                    { status_code: null }
                ]
            })
        };

        if (filter.from && filter.to) {
            where.date = {
                gte: dayjs.tz(filter.from, 'Asia/Ho_Chi_Minh').startOf('day').toDate(),
                lte: dayjs.tz(filter.to, 'Asia/Ho_Chi_Minh').endOf('day').toDate(),
            };
        }

        return this.prisma.work_schedules.findMany({
            where,
            include: {
                employees: {
                    include: {
                        users: {
                            select: {
                                full_name: true,
                                avatar_url: true,
                            }
                        }
                    }
                },
                timesheets: true,
            },
            orderBy: [
                { date: 'asc' },
                { expected_start: 'asc' }
            ],
        });
    }

    async register(userId: number, date: string, shiftCode: string) {
        // Validate shift_code
        const validShift = await this.prisma.system_lookups.findFirst({
            where: { type: 'SHIFT_CODE', code: shiftCode, deleted_at: null },
        });

        if (!validShift) {
            throw new Error(`Invalid shift code: ${shiftCode}`);
        }

        const scheduleDate = new Date(date);

        // Check duplicate
        const existing = await this.prisma.work_schedules.findFirst({
            where: {
                user_id: userId,
                date: scheduleDate,
                shift_code: shiftCode,
                deleted_at: null,
            },
        });

        if (existing) {
            throw new Error('Already registered or scheduled for this shift.');
        }

        // Set hours
        const shiftTimes: Record<string, { start: number; end: number }> = {
            'MORNING': { start: 8, end: 12 },
            'AFTERNOON': { start: 13, end: 17 },
            'EVENING': { start: 17, end: 21 },
        };
        const config = shiftTimes[shiftCode] || { start: 8, end: 12 };

        const expected_start = dayjs.tz(date, 'YYYY-MM-DD', 'Asia/Ho_Chi_Minh')
            .hour(config.start).minute(0).second(0).millisecond(0).toDate();
        const expected_end = dayjs.tz(date, 'YYYY-MM-DD', 'Asia/Ho_Chi_Minh')
            .hour(config.end).minute(0).second(0).millisecond(0).toDate();

        return this.prisma.work_schedules.create({
            data: {
                user_id: userId,
                date: scheduleDate,
                shift_code: shiftCode,
                expected_start,
                expected_end,
                status_code: 'PENDING',
            },
        });
    }

    async unregister(userId: number, date: string, shiftCode: string) {
        const scheduleDate = new Date(date);

        const existing = await this.prisma.work_schedules.findFirst({
            where: {
                user_id: userId,
                date: scheduleDate,
                shift_code: shiftCode,
                status_code: 'PENDING', // Only allow unregistering PENDING shifts
                deleted_at: null,
            },
        });

        if (!existing) {
            throw new Error('Pending registration not found. You can only unregister pending requests.');
        }

        return this.prisma.work_schedules.update({
            where: { schedule_id: existing.schedule_id },
            data: { deleted_at: new Date() },
        });
    }

    async getMySummary(userId: number, filter: GetSchedulesFilterDto) {
        const schedules = await this.findMySchedules(userId, filter);

        let totalShifts = 0;
        let totalHours = 0;

        schedules.forEach(schedule => {
            totalShifts++;
            totalHours += this.calculateHours(
                schedule.expected_start ? schedule.expected_start.toString() : null,
                schedule.expected_end ? schedule.expected_end.toString() : null
            );
        });

        // Use Math.round to ensure clean number formatting
        totalHours = Math.round(totalHours * 10) / 10;

        return {
            user_id: userId,
            total_shifts: totalShifts,
            total_hours: totalHours,
        };
    }
}
