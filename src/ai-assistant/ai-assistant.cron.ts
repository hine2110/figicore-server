import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AiAssistantService } from './ai-assistant.service';

@Injectable()
export class AiAssistantCron {
  private readonly logger = new Logger(AiAssistantCron.name);

  constructor(private readonly aiAssistantService: AiAssistantService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    this.logger.debug('Running daily AI Sales Assistant analysis...');
    try {
      await this.aiAssistantService.analyzeInventoryHealth();
      this.logger.debug('Successfully completed AI analysis.');
    } catch (error) {
      this.logger.error('Failed to run AI analysis', error);
    }
  }
}
