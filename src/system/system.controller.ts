import { Controller, Get, Patch, Body, UseGuards, Request } from '@nestjs/common';
import { SystemService } from './system.service';
import { UpdateOpexDto } from './dto/update-opex.dto';
import { UpdateWeeklyVoucherConfigDto } from './dto/weekly-voucher-config.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('opex')
  @UseGuards(JwtAuthGuard)
  async getOpexConfig() {
    const result = await this.systemService.getOpexConfig();
    return { success: true, data: result };
  }

  @Patch('opex')
  @UseGuards(JwtAuthGuard)
  async updateOpexConfig(
    @Body() dto: UpdateOpexDto,
    @Request() req: any,
  ) {
    const userId = req.user.userId;
    const result = await this.systemService.updateOpexConfig(dto, userId);
    return { success: true, data: result };
  }

  // --- Weekly Voucher Config APIs ---

  @Get('weekly-voucher')
  @UseGuards(JwtAuthGuard)
  async getWeeklyVoucherConfig() {
    const result = await this.systemService.getWeeklyVoucherConfig();
    return { success: true, data: result };
  }

  @Patch('weekly-voucher')
  @UseGuards(JwtAuthGuard)
  async updateWeeklyVoucherConfig(
    @Body() dto: UpdateWeeklyVoucherConfigDto,
    @Request() req: any,
  ) {
    const userId = req.user.userId;
    const result = await this.systemService.updateWeeklyVoucherConfig(dto, userId);
    return { success: true, data: result };
  }
}
