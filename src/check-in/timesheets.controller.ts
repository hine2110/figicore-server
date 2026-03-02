import { Controller, Post, UploadedFile, UseInterceptors, UseGuards, BadRequestException, ForbiddenException, Req, Get, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StoreIpGuard } from '../common/guards/store-ip.guard';
import { FaceVerificationService } from './face-verification.service';
import { UploadService } from '../upload/upload.service';
import { PrismaService } from '../prisma/prisma.service';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Ho_Chi_Minh');


const TIMESHEET_STATUS = {
    PRESENT: 'PRESENT',          // Đúng giờ
    LATE: 'LATE',                // Đi trễ (> 15 mins)
    COMPLETED: 'COMPLETED',      // Hoàn thành (Đúng giờ)
    EARLY_LEAVE: 'EARLY_LEAVE',  // Về sớm (> 5 mins)
    MISSING: 'MISSING',          // Quên Check-out / Vắng
    ABSENT: 'ABSENT',            // Vắng mặt (Logic hiển thị)
    UPCOMING: 'UPCOMING'         // Sắp tới (Logic hiển thị)
} as const;

@UseGuards(JwtAuthGuard, StoreIpGuard)
@Controller('check-in')
export class TimesheetsController {

    constructor(
        private readonly faceService: FaceVerificationService,
        private readonly uploadService: UploadService,
        private readonly prisma: PrismaService,
    ) { }

    @Post('verify-check-in')
    @UseInterceptors(FileInterceptor('file'))
    async verifyCheckIn(
        @UploadedFile() file: Express.Multer.File,
        @Req() req: any,
        @Query('mock_time') mockTime?: string
    ) {
        return this.handleVerification(file, req.user, 'CHECK_IN', mockTime);
    }

    @Post('verify-check-out')
    @UseInterceptors(FileInterceptor('file'))
    async verifyCheckOut(
        @UploadedFile() file: Express.Multer.File,
        @Req() req: any,
        @Query('mock_time') mockTime?: string
    ) {
        return this.handleVerification(file, req.user, 'CHECK_OUT', mockTime);
    }

    private async handleVerification(
        file: Express.Multer.File,
        user: any,
        type: 'CHECK_IN' | 'CHECK_OUT',
        mockTime?: string
    ) {
        if (!file) throw new BadRequestException("Vui lòng chụp ảnh khuôn mặt.");

        const userData = await this.prisma.users.findUnique({ where: { user_id: user.userId } });
        if (!userData || !userData.avatar_url) {
            throw new BadRequestException("Bạn chưa cập nhật ảnh đại diện (Avatar). Vui lòng cập nhật trước khi chấm công.");
        }

        const verification = await this.faceService.verifyUser(userData.avatar_url, file.buffer);
        if (!verification.isMatch) {
            throw new ForbiddenException(`Khuôn mặt không khớp! Độ chính xác: ${verification.confidence.toFixed(2)}%`);
        }

        const uploadResult = await this.uploadService.uploadFile(file, 'figicore_timesheets');
        const now = mockTime ? new Date(mockTime) : new Date();

        console.log(`🕒 DEBUG TIME: Đang test với thời gian: ${now.toLocaleString()}`);

        if (type === 'CHECK_IN') {
            await this.processCheckIn(user.userId, now, verification.confidence, uploadResult.url);
        } else {
            await this.processCheckOut(user.userId, now, verification.confidence, uploadResult.url);
        }

        return {
            success: true,
            message: type === 'CHECK_IN' ? "Check-in thành công!" : "Check-out thành công!",
            confidence: verification.confidence,
            image_url: uploadResult.url,
            timestamp: now
        };
    }

    private async processCheckIn(userId: number, now: Date, score: number, imgUrl: string) {
        const startOfDay = dayjs(now).tz('Asia/Ho_Chi_Minh').startOf('day').toDate();
        const endOfDay = dayjs(now).tz('Asia/Ho_Chi_Minh').endOf('day').toDate();

        const schedules = await this.prisma.work_schedules.findMany({
            where: {
                user_id: userId,
                date: { gte: startOfDay, lte: endOfDay },
                deleted_at: null
            },
            include: { timesheets: true }
        });

        if (!schedules || schedules.length === 0) {
            throw new BadRequestException("Bạn không có ca làm việc nào trong ngày hôm nay.");
        }

        const availableSchedules = schedules.filter(s => {
            const ts = s.timesheets?.[0];
            if (!ts) return true;
            if (ts.check_in_at && ts.check_out_at) return false; // Completed
            return true;
        });

        if (availableSchedules.length === 0) {
            throw new BadRequestException("Bạn đã hoàn thành tất cả ca làm việc hôm nay.");
        }

        // 🔥 FIX ERROR: Khai báo rõ kiểu dữ liệu cho bestMatch
        // Nó lấy kiểu của phần tử đầu tiên trong mảng availableSchedules
        let bestMatch: typeof availableSchedules[0] | null = null;
        let minDiff = Number.MAX_SAFE_INTEGER;

        for (const schedule of availableSchedules) {
            if (!schedule.expected_start || !schedule.expected_end) continue;

            // FIX 1: Force Timezone +07:00
            const scheduleStart = this.mergeDateAndTime(new Date(schedule.date), new Date(schedule.expected_start));
            const scheduleEnd = this.mergeDateAndTime(new Date(schedule.date), new Date(schedule.expected_end));

            // FIX 2: Strict 15-Minute Entry Window
            // Window opens: 15 mins BEFORE start
            // Window closes: 15 mins AFTER end (Too Late)
            const validWindowStart = new Date(scheduleStart.getTime() - 15 * 60 * 1000);
            const validWindowEnd = new Date(scheduleEnd.getTime() + 15 * 60 * 1000);

            // If now is BEFORE window -> Too Early
            if (now < validWindowStart) continue;

            // If now is AFTER window -> Too Late (Shift Closed)
            if (now > validWindowEnd) continue;

            const diff = Math.abs(now.getTime() - scheduleStart.getTime());
            if (diff < minDiff) {
                minDiff = diff;
                bestMatch = schedule;
            }
        }

        if (!bestMatch) {
            throw new BadRequestException("Chưa đến giờ vào ca tiếp theo (bạn chỉ được check-in trước 15 phút).");
        }

        // --- STATUS LOGIC ---
        // Tại đây bestMatch đã được TypeScript hiểu là không null nhờ lệnh throw bên trên
        const finalScheduleStart = this.mergeDateAndTime(new Date(bestMatch.date), new Date(bestMatch.expected_start!));

        const lateThreshold = new Date(finalScheduleStart.getTime() + 15 * 60 * 1000);

        let status: string = TIMESHEET_STATUS.PRESENT;
        if (now > lateThreshold) {
            status = TIMESHEET_STATUS.LATE;
        }

        const existingTimesheet = bestMatch.timesheets?.[0];
        if (existingTimesheet) {
            await this.prisma.timesheets.update({
                where: { timesheet_id: existingTimesheet.timesheet_id },
                data: {
                    check_in_at: now,
                    check_in_score: score,
                    check_in_img_url: imgUrl,
                    status_code: status,
                    updated_at: new Date()
                }
            });
        } else {
            await this.prisma.timesheets.create({
                data: {
                    schedule_id: bestMatch.schedule_id,
                    check_in_at: now,
                    check_in_score: score,
                    check_in_img_url: imgUrl,
                    status_code: status
                }
            });
        }
    }

    private async processCheckOut(userId: number, now: Date, score: number, imgUrl: string) {
        const openTimesheet = await this.prisma.timesheets.findFirst({
            where: {
                work_schedules: { user_id: userId },
                check_in_at: { not: null },
                check_out_at: null,
                deleted_at: null
            },
            include: { work_schedules: true },
            orderBy: { check_in_at: 'desc' }
        });

        if (!openTimesheet) {
            throw new BadRequestException("Bạn chưa check-in hoặc đã check-out rồi.");
        }

        if (!openTimesheet.work_schedules?.expected_end) {
            // Fallback if no expected end (should rare)
            const checkInTime = new Date(openTimesheet.check_in_at!);
            const durationMs = now.getTime() - checkInTime.getTime();
            const realWorkHours = durationMs / (1000 * 60 * 60);

            await this.prisma.timesheets.update({
                where: { timesheet_id: openTimesheet.timesheet_id },
                data: {
                    check_out_at: now,
                    check_out_score: score,
                    check_out_img_url: imgUrl,
                    real_work_hours: parseFloat(realWorkHours.toFixed(2)),
                    status_code: TIMESHEET_STATUS.COMPLETED,
                    updated_at: new Date()
                }
            });
            return;
        }

        const scheduleDate = new Date(openTimesheet.work_schedules.date);
        const expectedEnd = new Date(openTimesheet.work_schedules.expected_end);
        const validEndTime = this.mergeDateAndTime(scheduleDate, expectedEnd);

        // Step A: Validate Overdue (End + 15m)
        const overdueTime = new Date(validEndTime.getTime() + 15 * 60 * 1000);

        if (now > overdueTime) {
            await this.prisma.timesheets.update({
                where: { timesheet_id: openTimesheet.timesheet_id },
                data: {
                    status_code: TIMESHEET_STATUS.MISSING,
                    updated_at: new Date()
                }
            });
            throw new BadRequestException("Quá hạn check-out > 15p. Hệ thống đã ghi nhận lỗi MISSING.");
        }

        // Step B: Determine Status (Sticky Logic)
        const currentStatus = openTimesheet.status_code;
        let newStatus = currentStatus;

        // Case 1: LATE -> Keep LATE
        if (currentStatus === TIMESHEET_STATUS.LATE) {
            newStatus = TIMESHEET_STATUS.LATE;
        }
        // Case 2: PRESENT -> Check Early Leave
        else if (currentStatus === TIMESHEET_STATUS.PRESENT) {
            const earlyThreshold = new Date(validEndTime.getTime() - 5 * 60 * 1000);
            if (now < earlyThreshold) {
                newStatus = TIMESHEET_STATUS.EARLY_LEAVE;
            } else {
                newStatus = TIMESHEET_STATUS.COMPLETED;
            }
        }
        // Case 3: Else (Keep current - e.g. maybe already something else?)

        // Step C: Update DB
        const checkInTime = new Date(openTimesheet.check_in_at!);
        const durationMs = now.getTime() - checkInTime.getTime();
        const realWorkHours = durationMs / (1000 * 60 * 60);

        await this.prisma.timesheets.update({
            where: { timesheet_id: openTimesheet.timesheet_id },
            data: {
                check_out_at: now,
                check_out_score: score,
                check_out_img_url: imgUrl,
                real_work_hours: parseFloat(realWorkHours.toFixed(2)),
                status_code: newStatus,
                updated_at: new Date()
            }
        });
    }

    @Get('my-history')
    async getMyHistory(@Req() req: any, @Query('month') month?: number, @Query('year') year?: number) {
        const userId = req.user.userId;
        const now = new Date();
        const targetMonth = month ? Number(month) : now.getMonth() + 1;
        const targetYear = year ? Number(year) : now.getFullYear();
        const { startOfMonth, endOfMonth } = this.getStartAndEndOfMonth(targetMonth, targetYear);

        const employee = await this.prisma.employees.findUnique({
            where: { user_id: userId },
            select: { base_salary: true }
        });
        const hourlyRate = employee?.base_salary ? Number(employee.base_salary) : 0;

        const schedules = await this.prisma.work_schedules.findMany({
            where: {
                user_id: userId,
                date: { gte: startOfMonth, lte: endOfMonth },
                deleted_at: null
            },
            include: { timesheets: true },
            orderBy: { date: 'desc' }
        });

        let totalShifts = 0;
        let totalRealHours = 0;
        const logs: any[] = [];
        const todayZero = dayjs(now).tz('Asia/Ho_Chi_Minh').startOf('day').toDate();

        for (const schedule of schedules) {
            totalShifts++;
            const timesheet = schedule.timesheets?.[0];
            const scheduleDate = new Date(schedule.date);

            let status = '';
            let isFlagged = false;
            let realHours = 0;

            if (timesheet) {
                // Use DB status directly
                status = timesheet.status_code || TIMESHEET_STATUS.PRESENT;
                realHours = timesheet.real_work_hours || 0;

                if ([TIMESHEET_STATUS.LATE, TIMESHEET_STATUS.EARLY_LEAVE, TIMESHEET_STATUS.MISSING, TIMESHEET_STATUS.ABSENT].includes(status as any)) {
                    isFlagged = true;
                }
            } else {
                // Missing
                if (scheduleDate < todayZero) {
                    status = TIMESHEET_STATUS.ABSENT;
                    isFlagged = true;
                } else {
                    status = TIMESHEET_STATUS.UPCOMING;
                }
            }

            totalRealHours += realHours;

            logs.push({
                date: schedule.date,
                shift_name: schedule.shift_code,
                check_in_at: timesheet?.check_in_at || null,
                check_out_at: timesheet?.check_out_at || null,
                real_hours: realHours,
                status: status,
                is_flagged: isFlagged
            });
        }

        const expectedSalary = totalRealHours * hourlyRate;

        return {
            summary: {
                month: `${String(targetMonth).padStart(2, '0')}-${targetYear}`,
                total_shifts: totalShifts,
                total_hours: parseFloat(totalRealHours.toFixed(2)),
                expected_salary: expectedSalary,
                currency: 'VND'
            },
            logs: logs
        };
    }

    private getStartAndEndOfMonth(month: number, year: number) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-01`;
        const startOfMonth = dayjs.tz(dateStr, 'Asia/Ho_Chi_Minh').startOf('month').toDate();
        const endOfMonth = dayjs(startOfMonth).tz('Asia/Ho_Chi_Minh').endOf('month').toDate();
        return { startOfMonth, endOfMonth };
    }

    private mergeDateAndTime(dateObj: Date, timeObj: Date): Date {
        // Lấy ngày dưới định dạng YYYY-MM-DD tại múi giờ VN
        const dateStr = dayjs(dateObj).tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD');

        // Lấy thời gian UTC của timeObj do Prisma nạp lên (vốn dĩ lúc save đã dùng setUTCHours = Local Time)
        const h = String(timeObj.getUTCHours()).padStart(2, '0');
        const m = String(timeObj.getUTCMinutes()).padStart(2, '0');
        const s = String(timeObj.getUTCSeconds()).padStart(2, '0');
        const timeStrRaw = `${h}:${m}:${s}`;

        // Kết hợp lại nguyên khối vào múi giờ Asia/Ho_Chi_Minh
        return dayjs.tz(`${dateStr} ${timeStrRaw}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Ho_Chi_Minh').toDate();
    }
}