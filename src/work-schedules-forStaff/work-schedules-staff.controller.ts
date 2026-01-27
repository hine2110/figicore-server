import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { WorkSchedulesStaffService } from './work-schedules-staff.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetSchedulesFilterDto } from './dto/get-schedules-filter.dto';

@Controller('my-schedules')
@UseGuards(JwtAuthGuard)
export class WorkSchedulesStaffController {
    constructor(private readonly workSchedulesStaffService: WorkSchedulesStaffService) { }

    @Get()
    findMySchedules(@Req() req: any, @Query() filter: GetSchedulesFilterDto) {
        return this.workSchedulesStaffService.findMySchedules(req.user.user_id, filter);
    }

    @Get('my-summary')
    getMySummary(@Req() req: any, @Query() filter: GetSchedulesFilterDto) {
        return this.workSchedulesStaffService.getMySummary(req.user.user_id, filter);
    }
}
