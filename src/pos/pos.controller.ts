import { Controller, Get, Post, Body, Param, UseGuards, Request, Query } from '@nestjs/common';
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
   * Lấy danh sách ca làm việc
   * GET /pos/sessions
   */
  @Get('sessions')
  async getSessions(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const userId = req.user.userId;
    return this.posService.getSessions(userId, {
      page: page ? +page : 1,
      limit: limit ? +limit : 10,
    });
  }

  /**
   * Lấy analytics của session hiện tại
   * GET /pos/sessions/analytics
   */
  @Get('sessions/analytics')
  async getSessionAnalytics(@Request() req) {
    const userId = req.user.userId;
    return this.posService.getSessionAnalytics(userId);
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

  /**
   * Lấy chi tiết một ca làm việc cụ thể
   * GET /pos/sessions/:id
   */
  @Get('sessions/:id')
  async getSessionDetails(@Param('id') id: string) {
    return this.posService.getSessionDetails(+id);
  }
}