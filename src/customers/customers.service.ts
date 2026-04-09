import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption.service';
import { maskEmail, maskPhone } from '../common/mask.util';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService
  ) { }

  private decryptUser(user: any) {
    if (!user) return null;
    const { password_hash, otp_code, otp_expires_at, google_id, refresh_token, ...safeUser } = user;
    const decrypted = { ...safeUser };
    if (decrypted.email) decrypted.email = this.encryption.decrypt(decrypted.email);
    if (decrypted.phone) decrypted.phone = this.encryption.decrypt(decrypted.phone);
    return decrypted;
  }

  async findAll(page: number, limit: number, search?: string, requestingRole?: string) {
    const skip = (page - 1) * limit;
    const where: any = {
      role_code: 'CUSTOMER',
    };

    if (search) {
      const encryptedSearch = this.encryption.encryptDeterministic(search);
      where.OR = [
        { full_name: { contains: search, mode: 'insensitive' } },
        { email: encryptedSearch },
        { phone: encryptedSearch },
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

    const data = users.map((u) => {
      const decrypted = this.decryptUser(u);
      
      // Masking for List View: Apply to all management/staff roles to prevent bulk copy/scrapping
      const email = maskEmail(decrypted.email);
      const phone = maskPhone(decrypted.phone);

      return {
        user_id: decrypted.user_id,
        full_name: decrypted.full_name,
        email,
        phone,
        status_code: decrypted.status_code,
        avatar_url: decrypted.avatar_url,
        loyalty_points: u.customers?.loyalty_points ?? 0,
        current_rank_code: u.customers?.current_rank_code ?? 'BRONZE',
        total_spent: u.customers?.total_spent ?? 0,
        address: [] // Placeholder if needed, or omit
      };
    });

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


  async findOne(id: number, requestingUserId?: number, requestingRole?: string, ip?: string) {
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

    // Decrypt User
    const decrypted = this.decryptUser(user);

    // Audit Logging
    if (requestingUserId && requestingUserId !== id && requestingRole && requestingRole !== 'CUSTOMER') {
      await this.logPiiAccess(requestingUserId, id, ['phone', 'email', 'addresses'], ip);
    }

    // Flatten Response
    return {
      user_id: decrypted.user_id,
      full_name: decrypted.full_name,
      email: decrypted.email,
      phone: decrypted.phone,
      status_code: decrypted.status_code,
      avatar_url: decrypted.avatar_url,
      loyalty_points: user.customers?.loyalty_points ?? 0,
      current_rank_code: user.customers?.current_rank_code ?? 'BRONZE',
      total_spent: user.customers?.total_spent ?? 0,
      addresses: user.addresses ? user.addresses.map(a => {
        const decA = { ...a };
        if (decA.detail_address) decA.detail_address = this.encryption.decrypt(decA.detail_address);
        if (decA.recipient_phone) decA.recipient_phone = this.encryption.decrypt(decA.recipient_phone);
        return decA;
      }) : [],
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

  async updateCustomerStats(userId: number, amountSpent: number) {
    console.log(`[DEBUG] updateCustomerStats for User ${userId}. Amount Spent: ${amountSpent}`);

    // Fetch existing stats
    const existing = await this.prisma.customers.findUnique({
      where: { user_id: userId }
    });

    const oldSpent = Number(existing?.total_spent || 0);
    const newSpent = oldSpent + amountSpent;

    // Cumulative Points Logic:
    // 10,000 VNĐ = 1 Point (Very common in e-commerce, user gets points for small orders)
    const newTotalPoints = Math.floor(newSpent / 10000);

    // Update Customer Points & Spend
    const customer = await this.prisma.customers.upsert({
      where: { user_id: userId },
      update: {
        loyalty_points: newTotalPoints, // Set to absolute new total
        total_spent: newSpent
      },
      create: {
        user_id: userId,
        loyalty_points: newTotalPoints,
        total_spent: newSpent,
        current_rank_code: 'BRONZE'
      }
    });

    // Backend Ranks (Based on points, 10k VND = 1pt):
    // SILVER: 200 pts (2M VND)
    // GOLD: 1,000 pts (10M VND)
    // DIAMOND: 5,000 pts (50M VND)
    let newRank = 'BRONZE';
    if (newTotalPoints >= 5000) newRank = 'DIAMOND';
    else if (newTotalPoints >= 1000) newRank = 'GOLD';
    else if (newTotalPoints >= 200) newRank = 'SILVER';

    let rankUpgraded = false;
    if (newRank !== customer.current_rank_code) {
      await this.prisma.customers.update({
        where: { user_id: userId },
        data: { current_rank_code: newRank }
      });
      rankUpgraded = true;
    }

    const oldPoints = Math.floor(oldSpent / 10000);
    const pointsEarnedThisTime = newTotalPoints - oldPoints;

    return {
      success: true,
      pointsAdded: pointsEarnedThisTime,
      newTotalSpent: Number(customer.total_spent),
      rank_upgraded: rankUpgraded, // Using consistent naming if preferred
      newRank
    };
  }

  /** Log a PII access event when staff views sensitive customer data */
  private async logPiiAccess(accessedBy: number, targetUserId: number, fieldsViewed: string[], ip?: string) {
    try {
      await this.prisma.pii_access_logs.create({
        data: {
          accessed_by: accessedBy,
          target_user_id: targetUserId,
          fields_viewed: fieldsViewed.join(','),
          ip_address: ip || null,
        }
      });
    } catch (e) {
      // Non-blocking: log failure should NOT break the main request
      console.error('[PII Audit] Failed to write audit log:', e.message);
    }
  }
}

