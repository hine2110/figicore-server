import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private prisma: PrismaService,
    private encryption: EncryptionService,
  ) {}

  async getSummaryStats() {
    try {
      const revenueAgg = await this.prisma.orders.aggregate({
        _sum: { total_amount: true },
        where: { status_code: { notIn: ['CANCELLED', 'RETURNED'] } }
      });

      const activeUsersCount = await this.prisma.users.count({
        where: { status_code: 'ACTIVE' }
      });

      // Count KYC and Return Requests
      const activeReturnsCount = await this.prisma.return_requests.count({
        where: { status_code: 'PENDING' }
      });
      // We will assume pending updates is the status for profile_update_requests
      const pendingKycCount = await this.prisma.profile_update_requests.count({
        where: { status_code: 'PENDING' }
      }).catch(() => 0); // fallback if table structure differs slightly

      const pendingIssues = activeReturnsCount + pendingKycCount;

      const activeAuctions = await this.prisma.auctions.count({
        where: { status_code: 'ACTIVE' }
      }).catch(() => 0);

      const activeLivestreams = await this.prisma.livestreams.count({
        where: { status: 'LIVE' }
      }).catch(() => 0);

      return {
        totalRevenue: Number(revenueAgg._sum.total_amount) || 0,
        activeUsers: activeUsersCount,
        pendingIssues: pendingIssues,
        activeAuctions: activeAuctions,
        activeLivestreams: activeLivestreams,
        systemHealth: 99.9 // Mock static value for now or calculate based on logs if needed
      };
    } catch (error) {
      this.logger.error('Failed to get summary stats', error);
      throw error;
    }
  }

  async getRevenueChart() {
    try {
      const data: any[] = [];
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        
        const nextDate = new Date(date);
        nextDate.setDate(date.getDate() + 1);

        // Fetch all successful orders for this day
        const dailyOrders = await this.prisma.orders.findMany({
          where: {
            created_at: {
              gte: date,
              lt: nextDate,
            },
            status_code: { notIn: ['CANCELLED', 'RETURNED'] },
          },
          select: {
            total_amount: true,
            channel_code: true
          }
        });

        // Initialize category totals
        const dayData: any = {
          name: days[date.getDay()],
          retail: 0,
          livestream: 0,
          preorder: 0,
          blindbox: 0,
          auction: 0
        };

        // Sum up real data from DB
        dailyOrders.forEach(order => {
          const channel = (order.channel_code || '').toLowerCase();
          const amount = Number(order.total_amount) || 0;

          if (channel.includes('retail') || channel.includes('pos')) dayData.retail += amount;
          else if (channel.includes('livestream')) dayData.livestream += amount;
          else if (channel.includes('preorder')) dayData.preorder += amount;
          else if (channel.includes('blindbox')) dayData.blindbox += amount;
          else if (channel.includes('auction')) dayData.auction += amount;
          else dayData.retail += amount; // fallback for others to retail
        });

        data.push(dayData);
      }
      return data;
    } catch (error) {
      this.logger.error('Failed to get chart stats', error);
      throw error;
    }
  }

  async getRecentActivity() {
    try {
      // Base truth: users.status_code = 'ACTIVE', same source as the dashboard counter
      const activeUsers = await this.prisma.users.findMany({
        where: { status_code: 'ACTIVE' },
        take: 20,
        orderBy: { updated_at: 'desc' },
        include: {
          user_login_logs: {
            take: 1,
            orderBy: { login_time: 'desc' }
          }
        }
      });

      return activeUsers.map(u => {
        const lastLog = u.user_login_logs[0];
        // Decrypt email if it's encrypted
        const decryptedEmail = u.email ? this.encryption.decrypt(u.email) : 'N/A';

        return {
          user: u.full_name || 'Unknown',
          email: decryptedEmail,
          role: u.role_code || 'N/A',
          ip: lastLog?.ip_address || 'Chưa rõ',
          login_time: lastLog?.login_time
            ? new Date(lastLog.login_time).toLocaleString('vi-VN')
            : 'Chưa rõ',
          is_suspicious: lastLog?.is_suspicious || false,
          type: 'security'
        };
      });
    } catch (error) {
      this.logger.error('Failed to get recent activity', error);
      return [];
    }
  }
}
