import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createPromotionDto: CreatePromotionDto) {
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

    // 5. Transaction to save
    return this.prisma.$transaction(async (tx) => {
      // Check stock inside transaction to prevent race conditions
      if (promotion.max_quantity) {
        const current = await tx.promotions.findUnique({ where: { promotion_id: promotionId } });
        if (!current || (current.max_quantity && (current.collected_quantity || 0) >= current.max_quantity)) {
          throw new BadRequestException('Voucher is out of stock.');
        }
      }

      await tx.user_vouchers.create({
        data: {
          user_id: userId,
          promotion_id: promotionId,
          is_used: false,
        }
      });

      await tx.promotions.update({
        where: { promotion_id: promotionId },
        data: {
          collected_quantity: { increment: 1 }
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
}
