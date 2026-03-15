import { Controller, Post, Body, Patch, Param, UseGuards, Req, ParseIntPipe, Get, Query } from '@nestjs/common';
import { TimesheetCorrectionsService } from './timesheet-corrections.service';
import { CreateCorrectionDto } from './dto/create-correction.dto';
import { ReviewCorrectionDto } from './dto/review-correction.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('timesheet-corrections')
@UseGuards(JwtAuthGuard) // Bắt buộc đăng nhập cho toàn bộ API trong module này
export class TimesheetCorrectionsController {
    constructor(private readonly correctionsService: TimesheetCorrectionsService) { }

    // STAFF: Gửi yêu cầu khiếu nại ca làm
    @Post()
    create(@Req() req: any, @Body() dto: CreateCorrectionDto) {
        // Lấy userId từ token đăng nhập
        const userId = Number(req.user.userId || req.user.id || req.user.sub || req.user.user_id);
        return this.correctionsService.create(userId, dto);
    }

    // MANAGER/ADMIN: Duyệt hoặc Từ chối khiếu nại
    @Patch(':id/review')
    @UseGuards(RolesGuard)
    @Roles('SUPER_ADMIN', 'MANAGER') // Chỉ quản lý mới có quyền gọi API này
    review(
        @Param('id', ParseIntPipe) id: number,
        @Req() req: any,
        @Body() dto: ReviewCorrectionDto
    ) {
        // Lấy ID của người duyệt từ token
        const reviewerId = Number(req.user.userId || req.user.id || req.user.sub || req.user.user_id);
        return this.correctionsService.review(reviewerId, id, dto);
    }

    // Thêm vào trong Controller
    @Get('me')
    getMyCorrections(@Req() req: any) {
        const userId = Number(req.user.userId || req.user.id || req.user.sub || req.user.user_id);
        return this.correctionsService.getMyCorrections(userId);
    }

    @Get()
    @UseGuards(RolesGuard)
    @Roles('SUPER_ADMIN', 'MANAGER')
    getAllCorrections(@Query('status') status?: string) {
        return this.correctionsService.getAllCorrections(status);
    }
}