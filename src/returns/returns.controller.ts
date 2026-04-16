import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ReturnsService } from './returns.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { InspectReturnDto } from './dto/inspect-return.dto';

@Controller('returns')
export class ReturnsController {
    constructor(private readonly returnsService: ReturnsService) { }

    @UseGuards(AuthGuard('jwt'))
    @Post('request')
    createRequest(@Req() req, @Body() dto: CreateReturnDto) {
        return this.returnsService.createRequest(req.user.user_id, dto);
    }

    @UseGuards(AuthGuard('jwt'))
    @Get('my-requests')
    getMyReturns(@Req() req) {
        return this.returnsService.getMyReturns(req.user.user_id);
    }

    // --- ADMIN / MANAGER ---
    @UseGuards(AuthGuard('jwt')) // Add RolesGuard in actual production
    @Get('all')
    getAllReturns() {
        return this.returnsService.getAllReturns();
    }

    @UseGuards(AuthGuard('jwt'))
    @Patch(':id/status')
    updateStatus(
        @Param('id', ParseIntPipe) id: number,
        @Body('status') status: 'SHIPPING_TO_WAREHOUSE' | 'REJECTED',
        @Body('admin_note') adminNote?: string
    ) {
        return this.returnsService.updateStatus(id, status, adminNote);
    }

    // --- WAREHOUSE ---
    @UseGuards(AuthGuard('jwt'))
    @Patch(':id/receive')
    receiveAtWarehouse(@Param('id', ParseIntPipe) id: number) {
        return this.returnsService.receiveAtWarehouse(id);
    }

    @UseGuards(AuthGuard('jwt'))
    @Patch(':id/inspect')
    inspectReturn(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: InspectReturnDto,
        @Req() req
    ) {
        return this.returnsService.inspectReturn(id, dto, req.user.user_id);
    }
}
