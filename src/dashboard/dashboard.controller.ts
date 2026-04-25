import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @Roles('SUPER_ADMIN', 'MANAGER')
  getSummaryStats() {
    return this.dashboardService.getSummaryStats();
  }

  @Get('recent-activity')
  @Roles('SUPER_ADMIN', 'MANAGER')
  getRecentActivity() {
    return this.dashboardService.getRecentActivity();
  }

  @Get('manager-stats')
  getManagerStats(
    @Query('range') range: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return this.dashboardService.getManagerStats(range, startDate, endDate);
  }

  @Get('warehouse-stats')
  getWarehouseStats(
    @Query('range') range: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return this.dashboardService.getWarehouseStats(range, startDate, endDate);
  }
}
