import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenSessionDto } from './dto/open-session.dto';
import { CloseSessionDto } from './dto/close-session.dto';

@Injectable()
export class PosService {
  constructor(private prisma: PrismaService) { }

  /**
   * Mở ca làm việc mới
   */
  async openSession(userId: number, dto: OpenSessionDto) {
    // Kiểm tra xem nhân viên có ca đang mở không
    const existingSession = await this.prisma.pos_sessions.findFirst({
      where: {
        user_id: userId,
        status_code: 'OPEN',
        deleted_at: null,
      },
    });

    if (existingSession) {
      throw new BadRequestException(
        'Bạn đã có một ca đang mở. Vui lòng đóng ca trước khi mở ca mới.',
      );
    }

    // DEBUG: Log user info
    console.log('🔍 DEBUG openSession:');
    console.log('  - userId from JWT:', userId);
    console.log('  - typeof userId:', typeof userId);

    // Verify user exists in database
    const userExists = await this.prisma.users.findUnique({
      where: { user_id: userId }
    });

    console.log('  - User exists in DB:', !!userExists);
    if (userExists) {
      console.log('  - User email:', userExists.email);
      console.log('  - User role:', userExists.role_code);
    } else {
      console.log('  - ❌ USER NOT FOUND IN DATABASE!');
    }

    // Tạo session mới
    const session = await this.prisma.pos_sessions.create({
      data: {
        user_id: userId,
        opening_cash: dto.opening_cash,
        status_code: 'OPEN',
        opened_at: new Date(),
      },
    });

    return {
      success: true,
      message: 'Mở ca thành công',
      data: session,
    };
  }

  /**
   * Đóng ca làm việc
   */
  async closeSession(sessionId: number, userId: number, dto: CloseSessionDto) {
    // Lấy thông tin session
    const session = await this.prisma.pos_sessions.findFirst({
      where: {
        session_id: sessionId,
        user_id: userId,
        deleted_at: null,
      },
    });

    if (!session) {
      throw new NotFoundException('Không tìm thấy ca làm việc');
    }

    if (session.status_code !== 'OPEN') {
      throw new BadRequestException('Ca làm việc đã được đóng');
    }

    // Tính tổng doanh số trong ca (từ orders)
    const totalSales = await this.prisma.orders.aggregate({
      where: {
        session_id: sessionId,
        deleted_at: null,
      },
      _sum: {
        paid_amount: true,
      },
    });

    const expectedCash = Number(session.opening_cash) + Number(totalSales._sum.paid_amount || 0);
    const variance = dto.closing_cash - expectedCash;

    // Cập nhật session
    const updatedSession = await this.prisma.pos_sessions.update({
      where: { session_id: sessionId },
      data: {
        closing_cash: dto.closing_cash,
        closed_at: new Date(),
        status_code: 'CLOSED',
        note: dto.note,
      },
    });

    return {
      success: true,
      message: 'Đóng ca thành công',
      data: {
        session: updatedSession,
        summary: {
          opening_cash: session.opening_cash,
          closing_cash: dto.closing_cash,
          total_sales: totalSales._sum.paid_amount || 0,
          expected_cash: expectedCash,
          variance: variance,
        },
      },
    };
  }

  /**
   * Lấy ca làm việc hiện tại của nhân viên
   */
  async getCurrentSession(userId: number) {
    const session = await this.prisma.pos_sessions.findFirst({
      where: {
        user_id: userId,
        status_code: 'OPEN',
        deleted_at: null,
      },
      orderBy: {
        opened_at: 'desc',
      },
    });

    if (!session) {
      return {
        success: true,
        message: 'Không có ca làm việc đang mở',
        data: null,
      };
    }

    // Lấy số lượng đơn trong ca
    const orderCount = await this.prisma.orders.count({
      where: {
        session_id: session.session_id,
        deleted_at: null,
      },
    });

    return {
      success: true,
      data: {
        ...session,
        order_count: orderCount,
      },
    };
  }

  /**
   * Lấy analytics của session hiện tại
   */
  async getSessionAnalytics(userId: number) {
    // Lấy session đang mở
    const activeSession = await this.prisma.pos_sessions.findFirst({
      where: {
        user_id: userId,
        status_code: 'OPEN',
        deleted_at: null,
      },
    });

    if (!activeSession) {
      return {
        success: true,
        message: 'No active session',
        data: null,
      };
    }

    // 1. Lấy tất cả orders trong session
    const orders = await this.prisma.orders.findMany({
      where: {
        session_id: activeSession.session_id,
        deleted_at: null,
      },
      include: {
        order_items: {
          include: {
            product_variants: {
              include: {
                products: true,
              },
            },
          },
        },
      },
    });

    // 2. Tính toán thống kê cơ bản
    const totalSales = orders.reduce((sum, order) => sum + Number(order.total_amount), 0);
    const orderCount = orders.length;
    const avgOrderValue = orderCount > 0 ? totalSales / orderCount : 0;

    // 3. Payment method breakdown
    const paymentBreakdown: any = {};
    orders.forEach(order => {
      const method = order.payment_method_code;
      if (!method) return; // Skip if null
      if (!paymentBreakdown[method]) {
        paymentBreakdown[method] = { count: 0, amount: 0 };
      }
      paymentBreakdown[method].count += 1;
      paymentBreakdown[method].amount += Number(order.total_amount);
    });

    // 4. Sales by hour
    const salesByHour: any[] = [];
    const hourlyData: { [hour: number]: number } = {};

    orders.forEach(order => {
      if (!order.created_at) return; // Skip if null
      const hour = new Date(order.created_at).getHours();
      if (!hourlyData[hour]) {
        hourlyData[hour] = 0;
      }
      hourlyData[hour] += Number(order.total_amount);
    });

    Object.keys(hourlyData).forEach(hour => {
      salesByHour.push({
        hour: parseInt(hour),
        amount: hourlyData[parseInt(hour)],
      });
    });
    salesByHour.sort((a, b) => a.hour - b.hour);

    // 5. Top selling products
    const productSales: { [key: string]: { name: string; quantity: number; revenue: number } } = {};

    orders.forEach(order => {
      order.order_items.forEach((item: any) => {
        const productName = item.product_variants?.products?.name || 'Unknown';
        const productId = item.product_variants?.product_id || 0;
        const key = `${productId}-${productName}`;

        if (!productSales[key]) {
          productSales[key] = {
            name: productName,
            quantity: 0,
            revenue: 0,
          };
        }

        productSales[key].quantity += item.quantity;
        productSales[key].revenue += Number(item.total_price);
      });
    });

    const topProducts = Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // 6. Low stock alerts (products with stock < 5)
    const lowStockProducts = await this.prisma.product_variants.findMany({
      where: {
        stock_available: { lte: 5, gt: 0 },
        deleted_at: null,
        products: {
          status_code: 'ACTIVE',
        },
      },
      include: {
        products: {
          select: {
            name: true,
          },
        },
      },
      take: 5,
      orderBy: {
        stock_available: 'asc',
      },
    });

    const lowStockAlerts = lowStockProducts.map(variant => ({
      product: `${variant.products.name} - ${variant.option_name}`,
      stock: variant.stock_available,
    }));

    // 7. Session duration
    const openedAt = activeSession.opened_at ? new Date(activeSession.opened_at) : new Date();
    const now = new Date();
    const durationMs = now.getTime() - openedAt.getTime();
    const durationHours = Math.floor(durationMs / 3600000);
    const durationMinutes = Math.floor((durationMs % 3600000) / 60000);

    return {
      success: true,
      data: {
        session_id: activeSession.session_id,
        opened_at: activeSession.opened_at,
        opening_cash: activeSession.opening_cash,
        duration: {
          hours: durationHours,
          minutes: durationMinutes,
          total_minutes: Math.floor(durationMs / 60000),
        },
        statistics: {
          total_sales: totalSales,
          order_count: orderCount,
          avg_order_value: avgOrderValue,
          sales_per_hour: orderCount > 0 && durationHours > 0 ? orderCount / durationHours : 0,
        },
        payment_breakdown: paymentBreakdown,
        sales_by_hour: salesByHour,
        top_products: topProducts,
        low_stock_alerts: lowStockAlerts,
      },
    };
  }
}
