import { Controller, Get, Post, Body, Patch, Param, UseGuards, Req, Query, ParseIntPipe } from '@nestjs/common';
import { PayrollDisputesService } from './payroll-disputes.service';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { ReplyDisputeDto } from './dto/reply-dispute.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('payroll-disputes')
@UseGuards(JwtAuthGuard)
export class PayrollDisputesController {
    constructor(private readonly disputesService: PayrollDisputesService) { }

    @Post()
    create(@Req() req: any, @Body() dto: CreateDisputeDto) {
        const userId = Number(req.user.userId || req.user.id || req.user.sub || req.user.user_id);
        return this.disputesService.create(userId, dto);
    }

    @Get('me')
    getMyDisputes(@Req() req: any) {
        const userId = Number(req.user.userId || req.user.id || req.user.sub || req.user.user_id);
        return this.disputesService.getMyDisputes(userId);
    }

    @Get()
    @UseGuards(RolesGuard)
    @Roles('SUPER_ADMIN', 'MANAGER')
    getAllDisputes(@Query('status') status?: string) {
        return this.disputesService.getAllDisputes(status);
    }

    @Patch(':id/reply')
    @UseGuards(RolesGuard)
    @Roles('SUPER_ADMIN', 'MANAGER')
    replyToDispute(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: ReplyDisputeDto
    ) {
        return this.disputesService.replyToDispute(id, dto);
    }
}