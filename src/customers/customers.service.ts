import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) { }

  async findAll(page: number, limit: number, search?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (search) {
      where.OR = [
        { users: { full_name: { contains: search, mode: 'insensitive' } } },
        { users: { email: { contains: search, mode: 'insensitive' } } },
        { users: { phone: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.customers.findMany({
        where,
        include: {
          users: {
            select: {
              full_name: true,
              email: true,
              phone: true,
              status_code: true,
              avatar_url: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.customers.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }


  async findOne(id: number) {
    const customer = await this.prisma.customers.findUnique({
      where: { user_id: id },
      include: {
        users: {
          include: {
            addresses: true
          }
        }
      },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }

    return customer;
  }

  async getDashboardStats(userId: number) {
    // 1. Get Customer Details (Points, Rank)
    const customer = await this.prisma.customers.findUnique({
      where: { user_id: userId },
      select: { loyalty_points: true, current_rank_code: true }
    });

    // 2. Get Wallet Balance
    const wallet = await this.prisma.wallets.findUnique({
      where: { user_id: userId },
      select: { balance_available: true }
    });

    // 3. Count Active Orders (Not Completed, Cancelled, or Refunded)
    const activeOrders = await this.prisma.orders.count({
      where: {
        user_id: userId,
        status_code: {
          notIn: ['COMPLETED', 'CANCELLED', 'REFUNDED']
        }
      }
    });

    return {
      walletBalance: wallet?.balance_available || 0,
      loyaltyPoints: customer?.loyalty_points || 0,
      activeOrders: activeOrders,
      rankCode: customer?.current_rank_code || 'BRONZE'
    };

  }
}
