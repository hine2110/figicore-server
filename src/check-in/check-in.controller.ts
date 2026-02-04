import { Controller, Post, Body, UseGuards, Get, Query, Param, Req, BadRequestException } from '@nestjs/common';
import { CheckInService } from './check-in.service';

@Controller('check-in')
export class CheckInController {
    constructor(private readonly checkInService: CheckInService) { }

    @Post('verify-check-in')
    async verifyCheckIn(@Body() dto: { employeeId: number; imageBase64: string; stationToken: string; checkinPayload?: any }) {
        return this.checkInService.verifyCheckIn(dto);
    }

    @Post('verify-check-out')
    async verifyCheckOut(@Body() dto: { employeeId: number; imageBase64: string; stationToken: string }) {
        return this.checkInService.verifyCheckOut(dto);
    }

    // Manager/Admin only
    @Post('register-station')
    // @UseGuards(...) // Uncomment when Auth is ready
    async registerStation(@Body() body: { name: string; managerEmail?: string }, @Req() req) {
        let managerEmail = body.managerEmail;

        // Fallback to Auth User if available
        if (!managerEmail && req.user && req.user.email) {
            managerEmail = req.user.email;
        }

        // Validate
        if (!managerEmail) {
            throw new BadRequestException('Manager email is required for confirmation.');
        }

        return this.checkInService.registerStation(body.name, managerEmail);
    }

    @Get('station-status/:id')
    async getStationStatus(@Param('id') id: string) {
        return this.checkInService.getStationStatus(Number(id));
    }

    @Get('confirm-station')
    async confirmStation(@Query('token') token: string, @Query('action') action: 'approve' | 'deny') {
        return this.checkInService.confirmStation(token, action);
    }
}
