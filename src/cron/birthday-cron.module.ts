import { Module } from '@nestjs/common';
import { BirthdayCronService } from './birthday-cron.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PrismaModule, MailModule],
  providers: [BirthdayCronService],
})
export class BirthdayCronModule {}
