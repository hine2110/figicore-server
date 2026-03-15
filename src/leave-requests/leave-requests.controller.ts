import { Controller, Get, Post, Body, Patch, Param, UseGuards, Req, ParseIntPipe, Query } from '@nestjs/common';
import { LeaveRequestsService } from './leave-requests.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { UpdateLeaveStatusDto } from './dto/update-leave-status.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('leaves')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeaveRequestsController {
    constructor(private readonly leaveRequestsService: LeaveRequestsService) { }

    @Post()
    create(@Req() req: any, @Body() createDto: CreateLeaveRequestDto) {
        return this.leaveRequestsService.create(req.user.userId, createDto);
    }

    @Get('me')
    getMyLeaves(@Req() req: any) {
        return this.leaveRequestsService.getMyLeaves(req.user.userId);
    }

    @Get()
    @Roles('SUPER_ADMIN', 'MANAGER')
    getAllLeaves(@Query('status') status?: string) {
        return this.leaveRequestsService.getAllLeaves(status);
    }

    @Patch(':id/status')
    @Roles('SUPER_ADMIN', 'MANAGER')
    updateStatus(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateDto: UpdateLeaveStatusDto
    ) {
        return this.leaveRequestsService.updateStatus(id, updateDto);
    }
}
