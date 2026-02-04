import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { async } from 'rxjs';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) { }

  async findAll(page: number, limit: number, search?: string) {
    const skip = (page - 1) * limit;
    const where: any = {
      role_code: 'CUSTOMER',
    };

    if (search) {
      where.OR = [
        { full_name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.users.findMany({
        where,
        include: {
          customers: true,
        },
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.users.count({ where }),
    ]);

    const data = users.map((u) => ({
      user_id: u.user_id,
      full_name: u.full_name,
      email: u.email,
      phone: u.phone,
      status_code: u.status_code,
      avatar_url: u.avatar_url,
      loyalty_points: u.customers?.loyalty_points ?? 0,
      current_rank_code: u.customers?.current_rank_code ?? 'UNRANKED',
      total_spent: u.customers?.total_spent ?? 0,
      address: [] // Placeholder if needed, or omit
    }));

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
    let user = await this.prisma.users.findUnique({
      where: { user_id: id },
      include: {

        customers: true,
        addresses: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Self-Healing
    if (!user.customers && user.role_code === 'CUSTOMER') {
      const newCustomer = await this.prisma.customers.create({
        data: {
          user_id: user.user_id,
          loyalty_points: 0,
          current_rank_code: 'BRONZE',
          total_spent: 0,
        },
      });
      // Attach manually to avoid re-query
      user = { ...user, customers: newCustomer };
    }

    // Flatten Response
    return {
      user_id: user.user_id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      status_code: user.status_code,
      avatar_url: user.avatar_url,
      loyalty_points: user.customers?.loyalty_points ?? 0,
      current_rank_code: user.customers?.current_rank_code ?? 'UNRANKED',
      total_spent: user.customers?.total_spent ?? 0,
      addresses: user.addresses ?? [],
    };
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

  async addPoints(userId: number, amountSpent: number) {
    // 1 Point per 100,000 VND (Example Rule)
    const pointsEarned = Math.floor(amountSpent / 100000);

    if (pointsEarned > 0) {
      // Update Customer Points & Spend
      const customer = await this.prisma.customers.upsert({
        where: { user_id: userId },
        update: {
          loyalty_points: { increment: pointsEarned },
          total_spent: { increment: amountSpent }
        },
        create: {
          user_id: userId,
          loyalty_points: pointsEarned,
          total_spent: amountSpent,
          current_rank_code: 'BRONZE'
        }
      });

      // Check & Update Rank
      // Rank Rules: Bronze < 100, Silver < 500, Gold < 2000, Diamond >= 2000
      const currentPoints = customer.loyalty_points || 0;
      let newRank = 'BRONZE';

      if (currentPoints >= 2000) newRank = 'DIAMOND';
      else if (currentPoints >= 500) newRank = 'GOLD';
      else if (currentPoints >= 100) newRank = 'SILVER';

      if (newRank !== customer.current_rank_code) {
        await this.prisma.customers.update({
          where: { user_id: userId },
          data: { current_rank_code: newRank }
        });
      }
      return { success: true, pointsAdded: pointsEarned, newRank };
    }
    return { success: true, pointsAdded: 0 };
  }
}

