import { Module } from '@nestjs/common';
import { AiAssistantService } from './ai-assistant.service';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantCron } from './ai-assistant.cron';
import { PrismaModule } from '../prisma/prisma.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ProductPromotionsModule } from '../product-promotions/product-promotions.module';

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot(), ProductPromotionsModule],
  providers: [AiAssistantService, AiAssistantCron],
  controllers: [AiAssistantController]
})
export class AiAssistantModule {}
