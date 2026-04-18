import { Module } from '@nestjs/common';
import { ShiftCronService } from './shift-cron.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [ShiftCronService],
})
export class ShiftCronModule {}
