import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';

@Injectable()
export class PromotionsService {
  private readonly logger = new Logger(PromotionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(createPromotionDto: CreatePromotionDto) {
    if (createPromotionDto.discount_type === 'FIXED_AMOUNT') {
      const discountVal = Number(createPromotionDto.discount_value || 0);
      const minVal = Number(createPromotionDto.min_order_value || 0);
      if (discountVal > minVal && minVal > 0) {
        throw new BadRequestException('Fixed discount amount cannot be greater than the minimum order value required.');
      }
      if (discountVal > minVal && minVal === 0) {
        // Warning: giving away money without minimum. Still risky, but depends on logic.
        // Let's enforce that if min_order_value is 0, they can't have a discount > 0 (store gives away money for free items)
        throw new BadRequestException('Fixed discount amount cannot be greater than the minimum order value required.');
      }
    }

    return this.prisma.promotions.create({
      data: createPromotionDto,
    });
  }

  async findAll() {
    const now = new Date();
    return this.prisma.promotions.findMany({
      where: {
        OR: [
          { end_date: null },          // No expiry = always valid
          { end_date: { gt: now } }    // Not yet expired
        ]
      },
      orderBy: { created_at: 'desc' }
    });
  }

  async findOne(id: number) {
    const promo = await this.prisma.promotions.findUnique({
      where: { promotion_id: id },
    });
    if (!promo) throw new NotFoundException('Promotion not found');
    return promo;
  }

  async update(id: number, updatePromotionDto: UpdatePromotionDto) {
    const existing = await this.prisma.promotions.findUnique({ where: { promotion_id: id } });
    if (!existing) throw new NotFoundException('Promotion not found');

    const discountType = updatePromotionDto.discount_type || existing.discount_type;
    const discountValue = updatePromotionDto.hasOwnProperty('discount_value') ? updatePromotionDto.discount_value : existing.discount_value;
    const minOrderValue = updatePromotionDto.hasOwnProperty('min_order_value') ? updatePromotionDto.min_order_value : existing.min_order_value;

    if (discountType === 'FIXED_AMOUNT') {
      const discountVal = Number(discountValue || 0);
      const minVal = Number(minOrderValue || 0);
      if (discountVal > minVal) {
        throw new BadRequestException('Fixed discount amount cannot be greater than the minimum order value required.');
      }
    }

    return this.prisma.promotions.update({
      where: { promotion_id: id },
      data: updatePromotionDto,
    });
  }

  async remove(id: number) {
    return this.prisma.promotions.delete({
      where: { promotion_id: id },
    });
  }

  // --- Customer APIs ---

  async getCollectibleVouchers(userId: number) {
    // 1. Get user rank
    const customer = await this.prisma.customers.findUnique({
      where: { user_id: userId },
    });
    const rankCode = customer?.current_rank_code || 'BRONZE';

    // 2. Get public vouchers that apply to this rank (or all ranks)
    const promotions = await this.prisma.promotions.findMany({
      where: {
        is_public: true,
        OR: [
          { apply_rank_code: null },
          { apply_rank_code: rankCode }
        ]
      },
      orderBy: { created_at: 'desc' }
    });

    // 3. Check what has been collected
    const collected = await this.prisma.user_vouchers.findMany({
      where: { user_id: userId },
      select: { promotion_id: true }
    });
    const collectedIds = new Set(collected.map(c => c.promotion_id));

    const now = new Date();
    return promotions
      .filter(p => !collectedIds.has(p.promotion_id))
      .filter(p => !(p.max_quantity && (p.collected_quantity || 0) >= p.max_quantity))
      .filter(p => !p.end_date || new Date(p.end_date) >= now)
      .map(p => ({
        ...p,
        is_collected: false,
        can_collect: true,
        is_out_of_stock: false
      }));
  }

  async collectVoucher(userId: number, promotionId: number) {
    // 1. Check if promotion exists
    const promotion = await this.prisma.promotions.findUnique({
      where: { promotion_id: promotionId }
    });
    if (!promotion) throw new NotFoundException('Voucher not found');

    // 2. Check stock
    if (promotion.max_quantity && (promotion.collected_quantity || 0) >= promotion.max_quantity) {
      throw new BadRequestException('Voucher is out of stock.');
    }

    // 3. Check duplicate
    const existing = await this.prisma.user_vouchers.findFirst({
      where: { user_id: userId, promotion_id: promotionId }
    });
    if (existing) {
      throw new BadRequestException('You have already collected this voucher');
    }

    // 4. Check rank if needed
    if (promotion.apply_rank_code) {
      const customer = await this.prisma.customers.findUnique({
        where: { user_id: userId }
      });
      if (!customer || customer.current_rank_code !== promotion.apply_rank_code) {
        throw new BadRequestException('Voucher not applicable for your rank');
      }
    }

    // 5. Transaction to save (Atomic Update / Optimistic Concurrency Control)
    return this.prisma.$transaction(async (tx) => {
      if (promotion.max_quantity) {
        // OCC: Attempt to increment ONLY IF collected_quantity < max_quantity atomically
        const result = await tx.promotions.updateMany({
          where: {
            promotion_id: promotionId,
            // the database atomically ensures it only increments if condition is met
            collected_quantity: { lt: promotion.max_quantity }
          },
          data: {
            collected_quantity: { increment: 1 }
          }
        });

        if (result.count === 0) {
          // If count is 0, it means another transaction beat us to the last slot
          throw new BadRequestException('Voucher is out of stock.');
        }
      } else {
        // Unlimited vouchers: just increment
        await tx.promotions.update({
          where: { promotion_id: promotionId },
          data: { collected_quantity: { increment: 1 } }
        });
      }

      // Only if the atomic increment succeeded do we assign it to the user
      await tx.user_vouchers.create({
        data: {
          user_id: userId,
          promotion_id: promotionId,
          is_used: false,
        }
      });

      return { success: true, message: 'Voucher collected successfully' };
    });
  }

  async getMyVouchers(userId: number) {
    const now = new Date();
    return this.prisma.user_vouchers.findMany({
      where: { 
        user_id: userId,
        is_used: false,
        promotions: {
          OR: [
            { end_date: null },       // No expiry = always valid
            { end_date: { gt: now } } // Not yet expired
          ]
        }
      },
      include: {
        promotions: true
      },
      orderBy: { created_at: 'desc' }
    });
  }

  /**
   * CRON: Runs every minute.
   * Auto-delete Order Vouchers & Free Ship that expired > 10 minutes ago.
   *
   * Flow:
   *   1. Find promotions where end_date + 10min < now (hard-expired)
   *   2. Delete associated user_vouchers first (FK constraint)
   *   3. Hard-delete the promotion records from DB
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredVouchers() {
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

    // Find vouchers whose end_date passed more than 10 minutes ago
    const expiredVouchers = await this.prisma.promotions.findMany({
      where: {
        end_date: { not: null, lt: tenMinutesAgo }
      },
      select: { promotion_id: true, code: true }
    });

    if (expiredVouchers.length > 0) {
      const ids = expiredVouchers.map(v => v.promotion_id);
      const codes = expiredVouchers.map(v => v.code).join(', ');

      // Delete user_vouchers first (child records, FK constraint)
      await this.prisma.user_vouchers.deleteMany({
        where: { promotion_id: { in: ids } }
      });

      // Hard delete the promotions
      await this.prisma.promotions.deleteMany({
        where: { promotion_id: { in: ids } }
      });

      this.logger.log(
        `[AutoDelete] Hard-deleted ${ids.length} expired vouchers after 10-min grace period. ` +
        `Codes: [${codes}]`
      );
    }
  }
}
