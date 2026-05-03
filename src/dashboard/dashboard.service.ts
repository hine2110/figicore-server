import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private prisma: PrismaService) { }

  async getSummaryStats() {
    try {
      const [totalRevenue, totalRefunds, totalOrders, totalUsers, totalProducts] = await Promise.all([
        this.prisma.payment_transactions.aggregate({ _sum: { amount: true } }),
        this.prisma.wallet_transactions.aggregate({ where: { type_code: 'REFUND' }, _sum: { amount: true } }),
        this.prisma.orders.count({ where: { status_code: { notIn: ['CANCELLED', 'RETURNED'] } } }),
        this.prisma.users.count(),
        this.prisma.products.count()
      ]);

      return {
        totalRevenue: Number(totalRevenue._sum.amount) || 0,
        totalRefunds: Number(totalRefunds._sum.amount) || 0,
        totalOrders,
        totalUsers,
        totalProducts
      };
    } catch (error) {
      this.logger.error('Failed to get summary stats', error);
      return { totalRevenue: 0, totalOrders: 0, totalUsers: 0, totalProducts: 0 };
    }
  }

  async getRecentActivity() {
    try {
      const orders = await this.prisma.orders.findMany({
        take: 10,
        orderBy: { created_at: 'desc' },
        include: { users: { select: { full_name: true, avatar_url: true } } }
      });

      return orders.map(order => ({
        id: order.order_id,
        user: order.users?.full_name || 'Guest',
        avatar: order.users?.avatar_url,
        action: `Placed order #${order.order_code}`,
        time: order.created_at,
        amount: Number(order.total_amount),
        status: order.status_code,
        type: 'order'
      }));
    } catch (error) {
      this.logger.error('Failed to get recent activity', error);
      return [];
    }
  }

  async getManagerStats(range: string = 'week', customStart?: string, customEnd?: string) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let startDate: Date;
      let endDate: Date = new Date();

      if (customStart && customEnd) {
        startDate = new Date(customStart);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(customEnd);
        endDate.setHours(23, 59, 59, 999);
      } else {
        startDate = new Date(today);
        if (range === 'today') {
          startDate = today;
        } else if (range === 'week') {
          startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else if (range === 'month') {
          startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        }
      }

      const diff = endDate.getTime() - startDate.getTime();
      const prevStart = new Date(startDate.getTime() - diff);
      const prevEnd = new Date(startDate.getTime() - 1);

      const [online, offline, prevOnline, prevOffline, activeStaff, lowStockAlerts, revenueTrend] = await Promise.all([
        this.calculateAnalytics(startDate, endDate, false), // Online
        this.calculateAnalytics(startDate, endDate, true),  // Offline (POS)
        this.calculateAnalytics(prevStart, prevEnd, false),
        this.calculateAnalytics(prevStart, prevEnd, true),
        this.prisma.timesheets.count({ where: { check_out_at: null, created_at: { gte: today } } }),
        this.prisma.product_variants.count({ where: { stock_available: { lte: 10 } } }),
        this.getRevenueChart(startDate, endDate)
      ]);

      return {
        online,
        offline,
        totalRevenue: online.totalRevenue + offline.totalRevenue,
        totalRefunds: online.totalRefunds + offline.totalRefunds,
        totalOrders: online.totalOrders + offline.totalOrders,
        prevTotalRevenue: prevOnline.totalRevenue + prevOffline.totalRevenue,
        activeStaff,
        lowStockAlerts,
        revenueTrend
      };
    } catch (error) {
      this.logger.error('Failed to get manager stats', error);
      throw error;
    }
  }

  async getRevenueChart(customStart?: Date, customEnd?: Date) {
    const data: any[] = [];
    const start = customStart || new Date(new Date().getTime() - 6 * 24 * 60 * 60 * 1000);
    const end = customEnd || new Date();
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
    const step = Math.max(1, Math.ceil(diffDays / 7));

    for (let i = 0; i < diffDays; i += step) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(date.getDate() + step);

      const [onlineRev, offlineRev] = await Promise.all([
        this.prisma.orders.aggregate({
          _sum: { total_amount: true },
          where: { created_at: { gte: date, lt: nextDate }, channel_code: { not: 'POS' }, status_code: { in: ['PROCESSING', 'PACKED', 'SHIPPING', 'COMPLETED'] } }
        }),
        this.prisma.orders.aggregate({
          _sum: { total_amount: true },
          where: { created_at: { gte: date, lt: nextDate }, channel_code: 'POS', status_code: { in: ['PROCESSING', 'PACKED', 'SHIPPING', 'COMPLETED'] } }
        })
      ]);

      data.push({
        name: date.toLocaleDateString('en-US', { weekday: 'short' }),
        online: Number(onlineRev._sum.total_amount) || 0,
        offline: Number(offlineRev._sum.total_amount) || 0
      });
    }
    return data;
  }

  async getWarehouseStats(range: string = 'week', customStart?: string, customEnd?: string) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let startDate: Date;
      let endDate: Date = new Date();

      if (customStart && customEnd) {
        startDate = new Date(customStart);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(customEnd);
        endDate.setHours(23, 59, 59, 999);
      } else {
        startDate = new Date(today);
        if (range === 'today') {
          startDate = today;
        } else if (range === 'week') {
          startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else if (range === 'month') {
          startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        }
      }

      const diff = endDate.getTime() - startDate.getTime();
      const prevStartDate = new Date(startDate.getTime() - diff);
      const prevEndDate = new Date(startDate.getTime() - 1);

      const [
        readyToPack,
        packedCount,
        shippingCount,
        deliveredCount,
        inventoryTrend,
        currentAnalytics,
        previousAnalytics,
        activePreorderContracts,
        lowStockCount
      ] = await Promise.all([
        this.prisma.orders.count({ where: { status_code: 'PROCESSING', channel_code: { not: 'POS' } } }),
        this.prisma.orders.count({ where: { status_code: 'PACKED', channel_code: { not: 'POS' } } }),
        this.prisma.orders.count({ where: { status_code: 'SHIPPING', channel_code: { not: 'POS' } } }),
        this.prisma.orders.count({ where: { status_code: 'COMPLETED', updated_at: { gte: startDate, lte: endDate }, channel_code: { not: 'POS' } } }),
        this.getWarehouseChart(startDate, endDate),
        this.calculateAnalytics(startDate, endDate, false),
        this.calculateAnalytics(prevStartDate, prevEndDate, false),
        this.prisma.preorder_contracts.count({ where: { status_code: { notIn: ['CANCELLED', 'COMPLETED'] } } }),
        this.prisma.product_variants.count({ where: { stock_available: { lte: 10 } } })
      ]);

      const growth = this.calculateGrowth(currentAnalytics, previousAnalytics);

      return {
        readyToPack,
        packedCount,
        shippingCount,
        deliveredCount,
        lowStockAlerts: lowStockCount,
        inventoryTrend,
        analytics: {
          current: currentAnalytics,
          previous: previousAnalytics,
          growth,
          activePreorderContracts
        }
      };
    } catch (error) {
      this.logger.error('Failed to get warehouse stats', error);
      throw error;
    }
  }

  private async calculateAnalytics(start: Date, end: Date, isPos: boolean) {
    const channelFilter = isPos ? 'POS' : { not: 'POS' };
    const whereClause: any = {
      created_at: { gte: start, lte: end },
      status_code: { in: ['PROCESSING', 'PACKED', 'SHIPPING', 'COMPLETED', 'RETURNING', 'RETURNED'] },
      channel_code: channelFilter
    };

    const orders = await this.prisma.orders.findMany({
      where: whereClause,
      include: {
        order_items: {
          include: {
            product_variants: { include: { products: true } }
          }
        }
      }
    });

    // Calculate Refunds for these orders
    let refundsByOrder = new Map<number, number>();
    if (!isPos && orders.length > 0) {
        const returnReqs = await this.prisma.return_requests.findMany({
            where: { order_id: { in: orders.map(o => o.order_id) }, status_code: 'COMPLETED' },
            select: { return_id: true, order_id: true }
        });
        if (returnReqs.length > 0) {
            const refCodes = returnReqs.map(r => `RETURN-${r.return_id}`);
            const walletTrx = await this.prisma.wallet_transactions.findMany({
                where: { type_code: 'REFUND', reference_code: { in: refCodes } },
                select: { amount: true, reference_code: true }
            });
            for (const req of returnReqs) {
                const trx = walletTrx.find(t => t.reference_code === `RETURN-${req.return_id}`);
                if (trx) {
                    refundsByOrder.set(req.order_id, Number(trx.amount));
                }
            }
        }
    }

    const revenueMap = { RETAIL: 0, LIVESTREAM: 0, PRE_ORDER: 0, BLINDBOX: 0, AUCTION: 0, GIVEAWAY: 0 };
    let totalRevenue = 0;
    let totalRefunds = 0;
    let shippingCollected = 0;
    let shippingDiscount = 0;
    let freeshipOrders = 0;

    orders.forEach(order => {
      const amount = Number(order.total_amount);
      const refundAmount = refundsByOrder.get(order.order_id) || 0;
      
      totalRevenue += amount;
      totalRefunds += refundAmount;

      // Shipping stats
      const sFee = Number(order.shipping_fee || 0);
      const originalFee = Number(order.original_shipping_fee || 0);

      shippingCollected += sFee;

      if (order.shipping_promotion_id) {
        freeshipOrders++;
        shippingDiscount += Math.max(0, originalFee - sFee);
      }

      // POS only sells RETAIL
      if (isPos) {
        revenueMap['RETAIL'] += amount;
        return;
      }

      const type = order.order_items[0]?.product_variants?.products?.type_code || 'RETAIL';
      if (revenueMap.hasOwnProperty(type)) {
        revenueMap[type] += amount;
      } else {
        revenueMap['RETAIL'] += amount;
      }
    });

    const [
      retailStats,
      liveStats,
      preStats,
      blindboxStats,
      auctionStats,
      giveawayStats,
      shipments
    ] = await Promise.all([
      this.countOrderByType(start, end, 'RETAIL', isPos),
      isPos ? Promise.resolve({ count: 0 }) : this.countOrderByType(start, end, 'LIVESTREAM', isPos),
      isPos ? Promise.resolve({ count: 0 }) : this.countOrderByType(start, end, 'PRE_ORDER', isPos),
      isPos ? Promise.resolve({ count: 0 }) : this.countOrderByType(start, end, 'BLINDBOX', isPos),
      isPos ? Promise.resolve({ count: 0 }) : this.countOrderByType(start, end, 'AUCTION', isPos),
      isPos ? Promise.resolve({ count: 0 }) : this.countOrderByType(start, end, 'GIVEAWAY', isPos),
      isPos ? Promise.resolve({ _sum: { shipping_fee: 0 } }) : this.prisma.shipments.aggregate({ _sum: { shipping_fee: true }, where: { created_at: { gte: start, lte: end } } })
    ]);

    const shippingPaid = Number(shipments._sum.shipping_fee || 0);

    return {
        totalOrders: orders.length,
        totalRevenue,
        totalRefunds,
        shippingCollected,
        shippingPaid,
        shippingDiscount,
        freeshipOrders,
        counts: {
            retail: retailStats.count,
            livestream: liveStats.count,
            preorder: preStats.count,
            blindbox: blindboxStats.count,
            auction: auctionStats.count,
            giveaway: giveawayStats.count
        },
        revenue: {
            retail: revenueMap.RETAIL,
            livestream: revenueMap.LIVESTREAM,
            preorder: revenueMap.PRE_ORDER,
            blindbox: revenueMap.BLINDBOX,
            auction: revenueMap.AUCTION,
            giveaway: revenueMap.GIVEAWAY
        }
    };
  }

  private async countOrderByType(start: Date, end: Date, type: string, isPos: boolean) {
    const channelFilter = isPos ? 'POS' : { not: 'POS' };
    const where: any = {
      created_at: { gte: start, lte: end },
      status_code: { in: ['PROCESSING', 'PACKED', 'SHIPPING', 'COMPLETED', 'RETURNING', 'RETURNED'] },
      channel_code: channelFilter,
      order_items: {
        some: type === 'GIVEAWAY' ? { giveaway_claim_id: { not: null } } :
          type === 'AUCTION' ? { metadata: { path: ['is_auction'], equals: true } } :
            { product_variants: { products: { type_code: type } } }
      }
    };

    if (type === 'PRE_ORDER' && !isPos) {
      const count = await this.prisma.preorder_contracts.count({
        where: { created_at: { gte: start, lte: end } }
      });
      return { count, revenue: 0 };
    }

    const count = await this.prisma.orders.count({ where });
    return { count, revenue: 0 };
  }

  private calculateGrowth(curr: any, prev: any) {
    const calc = (c: number, p: number) => {
      if (!p) return c > 0 ? 100 : 0;
      return Math.round(((c - p) / p) * 100);
    };

    return {
      totalOrders: calc(curr.totalOrders, prev.totalOrders),
      onlineRevenue: calc(curr.totalRevenue, prev.totalRevenue),
      packedOrders: 0
    };
  }

  async getWarehouseChart(start: Date, end: Date) {
    const data: any[] = [];
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
    const step = Math.max(1, Math.ceil(diffDays / 7));

    for (let i = 0; i < diffDays; i += step) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      d.setHours(0, 0, 0, 0);
      const nextD = new Date(d);
      nextD.setDate(d.getDate() + step);

      const [packed, inbound] = await Promise.all([
        this.prisma.orders.count({ where: { status_code: 'COMPLETED', updated_at: { gte: d, lt: nextD } } }),
        this.prisma.inventory_logs.count({ where: { change_type_code: 'INBOUND', created_at: { gte: d, lt: nextD } } })
      ]);

      data.push({ name: d.toLocaleDateString('en-US', { weekday: 'short' }), packed, inbound });
    }
    return data;
  }
}
