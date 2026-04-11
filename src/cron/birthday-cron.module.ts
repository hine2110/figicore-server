import { Module } from '@nestjs/common';
import { BirthdayCronService } from './birthday-cron.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { EncryptionService } from '../common/encryption.service';

@Module({
  imports: [PrismaModule, MailModule],
  providers: [BirthdayCronService, EncryptionService],
})
export class BirthdayCronModule {}
