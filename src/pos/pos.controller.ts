import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { PosService } from './pos.service';
import { OpenSessionDto } from './dto/open-session.dto';
import { CloseSessionDto } from './dto/close-session.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('pos')
@UseGuards(JwtAuthGuard)
export class PosController {
  constructor(private readonly posService: PosService) { }

  /**
   * Mở ca làm việc mới
   * POST /pos/sessions/open
   */
  @Post('sessions/open')
  async openSession(@Request() req, @Body() dto: OpenSessionDto) {
    const userId = req.user.userId;
    return this.posService.openSession(userId, dto);
  }

  /**
   * Đóng ca làm việc
   * POST /pos/sessions/:id/close
   */
  @Post('sessions/:id/close')
  async closeSession(
    @Request() req,
    @Param('id') sessionId: string,
    @Body() dto: CloseSessionDto,
  ) {
    const userId = req.user.userId;
    return this.posService.closeSession(+sessionId, userId, dto);
  }

  /**
   * Lấy ca làm việc hiện tại
   * GET /pos/sessions/current
   */
  @Get('sessions/current')
  async getCurrentSession(@Request() req) {
    const userId = req.user.userId;
    return this.posService.getCurrentSession(userId);
  }
}