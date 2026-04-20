import { Module } from '@nestjs/common';
import { WeeklyVoucherCronService } from './weekly-voucher-cron.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { EncryptionService } from '../common/encryption.service';
import { SystemModule } from '../system/system.module';

@Module({
  imports: [PrismaModule, MailModule, SystemModule],
  providers: [WeeklyVoucherCronService, EncryptionService],
  exports: [WeeklyVoucherCronService],
})
export class WeeklyVoucherCronModule {}
