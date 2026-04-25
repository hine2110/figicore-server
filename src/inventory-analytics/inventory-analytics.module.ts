import { Module } from '@nestjs/common';
import { InventoryAnalyticsController } from './inventory-analytics.controller';
import { InventoryAnalyticsService } from './inventory-analytics.service';
import { MarketIntelligenceService } from './market-intelligence.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [InventoryAnalyticsController],
  providers: [InventoryAnalyticsService, MarketIntelligenceService],
  exports: [InventoryAnalyticsService, MarketIntelligenceService],
})
export class InventoryAnalyticsModule {}
