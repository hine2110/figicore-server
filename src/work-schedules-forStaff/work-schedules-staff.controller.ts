import { Controller, Get, Post, Delete, Body, Query, Req, UseGuards } from '@nestjs/common';
import { WorkSchedulesStaffService } from './work-schedules-staff.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetSchedulesFilterDto } from './dto/get-schedules-filter.dto';
import { AllowAnyIp } from '../common/decorators/allow-any-ip.decorator';

@Controller('my-schedules')
@UseGuards(JwtAuthGuard)
export class WorkSchedulesStaffController {
    constructor(private readonly workSchedulesStaffService: WorkSchedulesStaffService) { }

    @Get()
    @AllowAnyIp()
    findMySchedules(@Req() req: any, @Query() filter: GetSchedulesFilterDto) {
        return this.workSchedulesStaffService.findMySchedules(req.user.user_id, filter);
    }

    @Post('register')
    @AllowAnyIp()
    register(@Req() req: any, @Body() body: { date: string, shift_code: string }) {
        return this.workSchedulesStaffService.register(req.user.user_id, body.date, body.shift_code);
    }

    @Delete('unregister')
    @AllowAnyIp()
    unregister(@Req() req: any, @Query('date') date: string, @Query('shift_code') shift_code: string) {
        return this.workSchedulesStaffService.unregister(req.user.user_id, date, shift_code);
    }

    @Get('my-summary')
    @AllowAnyIp()
    getMySummary(@Req() req: any, @Query() filter: GetSchedulesFilterDto) {
        return this.workSchedulesStaffService.getMySummary(req.user.user_id, filter);
    }
}
