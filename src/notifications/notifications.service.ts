import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private eventsGateway: EventsGateway,
  ) {}

  async create(userId: number, title: string, content: string, targetUrl?: string, broadcastSocket: boolean = true) {
    try {
      const notification = await this.prisma.notifications.create({
        data: {
          user_id: userId,
          title,
          content,
          target_url: targetUrl,
          is_read: false,
        },
      });

      if (broadcastSocket) {
        this.eventsGateway.notifyUser(userId, 'new_notification', notification);
      }

      return notification;
    } catch (error) {
      this.logger.error(`Failed to create notification for user ${userId}`, error);
      return null;
    }
  }

  async findAll(userId: number) {
    return this.prisma.notifications.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: 50, // Limit to latest 50 for performance
    });
  }

  async markAsRead(id: number, userId: number) {
    return this.prisma.notifications.updateMany({
      where: { notification_id: id, user_id: userId },
      data: { is_read: true },
    });
  }

  async markAllAsRead(userId: number) {
    return this.prisma.notifications.updateMany({
      where: { user_id: userId, is_read: false },
      data: { is_read: true },
    });
  }
}
