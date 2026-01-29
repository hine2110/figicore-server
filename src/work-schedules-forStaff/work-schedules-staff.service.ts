import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GetSchedulesFilterDto } from './dto/get-schedules-filter.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class WorkSchedulesStaffService {
    constructor(private prisma: PrismaService) { }

    private calculateHours(start: string | null, end: string | null): number {
        if (!start || !end) return 0;

        const startTime = new Date(start).getTime();
        const endTime = new Date(end).getTime();

        let durationMs = endTime - startTime;

        // Handle negative duration (Overnight shift: e.g., 22:00 -> 04:00)
        if (durationMs < 0) {
            durationMs += 24 * 60 * 60 * 1000; // Add 24 hours
        }

        const durationHours = durationMs / (1000 * 60 * 60);
        return Math.round(durationHours * 10) / 10; // Round to 1 decimal
    }

    async findMySchedules(userId: number, filter: GetSchedulesFilterDto) {
        const where: Prisma.work_schedulesWhereInput = {
            user_id: userId,
            deleted_at: null,
        };

        if (filter.from && filter.to) {
            where.date = {
                gte: new Date(filter.from),
                lte: new Date(filter.to),
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
                }
            },
            orderBy: {
                date: 'asc',
            },
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
