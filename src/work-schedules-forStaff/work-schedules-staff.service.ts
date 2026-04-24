import { Injectable, BadRequestException, Logger } from '@nestjs/common';
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
    private readonly logger = new Logger(WorkSchedulesStaffService.name);
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
                gte: dayjs.utc(filter.from).startOf('day').toDate(),
                lte: dayjs.utc(filter.to).endOf('day').toDate(),
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
        const now = dayjs().tz('Asia/Ho_Chi_Minh');
        const currentDay = now.day(); // 0: Sun, 1: Mon, ..., 4: Thu, 5: Fri, 6: Sat

        // 1. Kiểm tra khung giờ đăng ký: Thứ 5 (4) 00:01 đến Thứ 6 (5) 23:59
        const isRegistrationWindow = (currentDay === 4 && (now.hour() > 0 || now.minute() > 0)) || (currentDay === 5);
        
        if (!isRegistrationWindow) {
            throw new BadRequestException('Registration is only allowed from Thursday 00:01 to Friday 23:59.');
        }

        // 2. Kiểm tra tuần đăng ký: Chỉ cho phép tuần KẾ TIẾP
        // Xác định ngày bắt đầu của tuần tới (Thứ 2 tuần sau)
        const startOfNextWeek = now.startOf('week').day(1).add(1, 'week').startOf('day');
        const endOfNextWeek = startOfNextWeek.add(6, 'days').endOf('day');

        const localDate = dayjs.tz(date, 'Asia/Ho_Chi_Minh').startOf('day');
        
        if (localDate.isBefore(startOfNextWeek) || localDate.isAfter(endOfNextWeek)) {
            this.logger.warn(`User ${userId} tried to register for ${date}. Window: ${startOfNextWeek.format('YYYY-MM-DD')} to ${endOfNextWeek.format('YYYY-MM-DD')}`);
            throw new BadRequestException('You can only register for shifts in the NEXT calendar week.');
        }

        // Validate shift_code
        const validShift = await this.prisma.system_lookups.findFirst({
            where: { type: 'SHIFT_CODE', code: shiftCode, deleted_at: null },
        });

        if (!validShift) {
            throw new BadRequestException(`Invalid shift code: ${shiftCode}`);
        }

        // Lưu ngày ở dạng "phẳng" (UTC 00:00) để khớp chính xác với substring(0,10) của Frontend
        const targetDate = dayjs.utc(date).startOf('day');
        const scheduleDate = targetDate.toDate();

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
            throw new BadRequestException('Already registered or scheduled for this shift.');
        }

        // Set hours (Fixed 4-hour blocks)
        const shiftTimes: Record<string, { start: number; end: number }> = {
            'MORNING': { start: 8, end: 12 },
            'AFTERNOON': { start: 13, end: 17 },
            'EVENING': { start: 17, end: 21 },
        };
        const config = shiftTimes[shiftCode] || { start: 8, end: 12 };

        const expected_start = localDate.hour(config.start).minute(0).second(0).millisecond(0).toDate();
        const expected_end = localDate.hour(config.end).minute(0).second(0).millisecond(0).toDate();

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
        const now = dayjs().tz('Asia/Ho_Chi_Minh');
        const scheduleDate = dayjs.utc(date).startOf('day').toDate();
        const currentDay = now.day();

        // 1. Kiểm tra khung giờ đăng ký: Chỉ được phép sửa trong Thứ 5 và Thứ 6
        const isRegistrationWindow = (currentDay === 4 && (now.hour() > 0 || now.minute() > 0)) || (currentDay === 5);
        
        if (!isRegistrationWindow) {
            throw new BadRequestException('You can only modify registrations during the window (Thursday 00:01 to Friday 23:59).');
        }

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
            throw new BadRequestException('Pending registration not found. You can only unregister pending requests during the registration window.');
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
