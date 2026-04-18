import { Module } from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { PromotionsController } from './promotions.controller';
import { MailModule } from '../mail/mail.module';
import { EncryptionService } from '../common/encryption.service';
import { WeeklyVoucherCronModule } from '../cron/weekly-voucher-cron.module';

@Module({
  imports: [MailModule, WeeklyVoucherCronModule],
  controllers: [PromotionsController],
  providers: [PromotionsService, EncryptionService],
  exports: [PromotionsService],
})
export class PromotionsModule {}
