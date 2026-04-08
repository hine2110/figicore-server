import { Controller, Post, Get, Query, Patch, Param, UseGuards, Request, Body } from '@nestjs/common';
import { InventoryAnalyticsService } from './inventory-analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('analytics')
export class InventoryAnalyticsController {
  constructor(private readonly inventoryAnalyticsService: InventoryAnalyticsService) {}

  @Post('trigger-inventory-check')
  async triggerInventoryCheck(): Promise<any> {
    const result = await this.inventoryAnalyticsService.triggerInventoryCheck();
    return { success: true, data: result };
  }

  @Post('blindbox-pricing')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  async analyzeBlindboxRisk(
    @Body('minValue') minValue: number,
    @Body('maxValue') maxValue: number,
    @Body('suggestedPrice') suggestedPrice?: number,
  ): Promise<any> {
    const result = await this.inventoryAnalyticsService.analyzeBlindboxRisk(minValue, maxValue, suggestedPrice);
    return { success: true, data: result };
  }

  @Get('recommendations')
  async getRecommendations(
    @Query('status') status?: string,
    @Query('type') type?: string,
  ): Promise<any> {
    const result = await this.inventoryAnalyticsService.getRecommendations({ status, type });
    return { success: true, data: result };
  }

  @Get('global')
  async getGlobalInventory(): Promise<any> {
    const result = await this.inventoryAnalyticsService.getGlobalInventory();
    return { success: true, data: result };
  }

  @Patch('recommendations/:id/apply')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  async applyRecommendation(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<any> {
    const userId = req.user.userId;
    const result = await this.inventoryAnalyticsService.applyRecommendation(+id, userId);
    return { success: true, data: result };
  }
}
