import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ShiftCronService {
  private readonly logger = new Logger(ShiftCronService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  // 00:00 every Thursday
  @Cron('0 0 * * 4', {
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async notifyShiftRegistrationOpen() {
    this.logger.log('Executing CRON: notifyShiftRegistrationOpen - Alerting POS and Warehouse staff');

    try {
      const activeStaff = await this.prisma.users.findMany({
        where: {
          role_code: {
            in: ['STAFF_POS', 'STAFF_INVENTORY'],
          },
          deleted_at: null,
        },
      });

      if (!activeStaff || activeStaff.length === 0) {
        this.logger.log('No active staff found for shift registration notification.');
        return;
      }

      let count = 0;
      for (const user of activeStaff) {
        const targetUrl = user.role_code === 'STAFF_POS' 
          ? '/pos/shift-registration' 
          : '/warehouse/shift-registration';

        await this.notificationsService.create(
          user.user_id,
          'Đăng Ký Lịch Làm Tuần Mới! ⏰',
          'Cổng đăng ký lịch làm cho tuần tới đã được mở. Hạn chót đăng ký là vào 23:59 đêm Thứ Sáu. Hãy vào đăng ký ngay nhé!',
          targetUrl,
          true
        );
        count++;
      }

      this.logger.log(`CRON Success: Sent shift registration notification to ${count} staff members.`);
    } catch (error) {
      this.logger.error('CRON Error: Failed to send shift registration notifications', error);
    }
  }
}
