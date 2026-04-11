import { Injectable, BadRequestException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { EncryptionService } from '../common/encryption.service';

@Injectable()
export class PromotionsService {
  private readonly logger = new Logger(PromotionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly encryption: EncryptionService,
  ) {}

  // ─── Manager APIs ──────────────────────────────────────────────────────────

  async create(createPromotionDto: CreatePromotionDto) {
    if (createPromotionDto.discount_type === 'FIXED_AMOUNT') {
      const discountVal = Number(createPromotionDto.discount_value || 0);
      const minVal = Number(createPromotionDto.min_order_value || 0);
      if (discountVal > minVal) {
        throw new BadRequestException('Fixed discount amount cannot be greater than the minimum order value required.');
      }
    }

    const promotion = await this.prisma.promotions.create({
      data: createPromotionDto,
    });

    // ── Fire-and-forget: Send targeted emails without blocking the HTTP response ──
    this._dispatchTargetedPromotionEmails(promotion).catch(err =>
      this.logger.error(`[PromotionsService] Background email dispatch failed for promotion #${promotion.promotion_id}`, err)
    );

    return promotion;
  }

  /**
   * Async background job: Queries eligible customers and sends bulk emails.
   * This is intentionally NOT awaited by the create() caller.
   */
  private async _dispatchTargetedPromotionEmails(promotion: any) {
    this.logger.log(`[EmailDispatch] Starting for promotion #${promotion.promotion_id} (rank: ${promotion.apply_rank_code || 'ALL'})`);

    // Build the customer filter based on rank targeting
    const customerFilter: any = { deleted_at: null };
    if (promotion.apply_rank_code) {
      customerFilter.current_rank_code = promotion.apply_rank_code;
    }

    const eligibleCustomers = await this.prisma.customers.findMany({
      where: customerFilter,
      include: {
        users: {
          select: { email: true, full_name: true },
        },
      },
    });

    const usersWithEmails = eligibleCustomers
      .map(c => c.users)
      .filter(u => u && u.email);

    this.logger.log(`[EmailDispatch] Found ${eligibleCustomers.length} eligible customer(s), mapped to ${usersWithEmails.length} user(s) with valid emails.`);

    if (usersWithEmails.length === 0) {
      this.logger.warn(`[EmailDispatch] No users with valid emails found for rank: ${promotion.apply_rank_code || 'ALL'}`);
      return;
    }

    // Send emails sequentially to avoid overwhelming SMTP
    for (const user of usersWithEmails) {
      try {
        const decEmail = this.encryption.decrypt(user!.email!);
        const decName = this.encryption.decrypt(user!.full_name!);
        await this.mailService.sendTargetedPromotionEmail({ email: decEmail, full_name: decName }, promotion);
      } catch (err) {
        this.logger.error(`[EmailDispatch] Failed to send to ${user!.email}`, err);
      }
    }

    this.logger.log(`[EmailDispatch] Completed for promotion #${promotion.promotion_id}`);
  }

  async findAll() {
    return this.prisma.promotions.findMany({
      orderBy: { created_at: 'desc' },
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
      data: {
        ...updatePromotionDto,
        // Never allow manager update to reset the collection counter
        collected_quantity: undefined,
        // Never allow manager update to deactivate via regular update endpoint
        // (deactivation only happens via cron or remove())
        is_active: updatePromotionDto.is_active === false ? existing.is_active : (updatePromotionDto.is_active ?? existing.is_active),
      },
    });
  }

  async resume(id: number) {
    return this.prisma.promotions.update({
      where: { promotion_id: id },
      data: { is_active: true },
    });
  }

  async remove(id: number) {
    return this.prisma.promotions.update({
      where: { promotion_id: id },
      data: { is_active: false },
    });
  }

  // ─── Customer APIs ─────────────────────────────────────────────────────────

  async getCollectibleVouchers(userId: number) {
    const customer = await this.prisma.customers.findUnique({
      where: { user_id: userId },
    });
    const rankCode = customer?.current_rank_code || 'BRONZE';

    const promotions = await this.prisma.promotions.findMany({
      where: {
        is_public: true,
        OR: [
          { apply_rank_code: null },
          { apply_rank_code: rankCode },
        ],
      },
      orderBy: { created_at: 'desc' },
    });

    const collected = await this.prisma.user_vouchers.findMany({
      where: { user_id: userId },
      select: { promotion_id: true },
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
        is_out_of_stock: false,
      }));
  }
  /**
   * POST /promotions/:id/collect
   * Strict validation: active check, rank check, duplicate check.
   */
  async collectVoucher(userId: number, promotionId: number) {
    const now = new Date();

    // 1. Fetch promotion with validation
    const promotion = await this.prisma.promotions.findUnique({
      where: { promotion_id: promotionId },
    });
    if (!promotion) throw new NotFoundException('Voucher not found');

    // 2. Window validation
    if (promotion.start_date && new Date(promotion.start_date) > now) {
      throw new BadRequestException('This voucher is not yet active.');
    }
    if (promotion.end_date && new Date(promotion.end_date) < now) {
      throw new BadRequestException('This voucher has already expired.');
    }

    // 3. Quota check
    if (promotion.max_quantity && (promotion.collected_quantity || 0) >= promotion.max_quantity) {
      throw new BadRequestException('Voucher is out of stock.');
    }

    // 4. Rank targeting check
    if (promotion.apply_rank_code) {
      const customer = await this.prisma.customers.findUnique({
        where: { user_id: userId },
      });
      if (!customer) {
        throw new ForbiddenException('Customer profile not found.');
      }
      if (customer.current_rank_code !== promotion.apply_rank_code) {
        throw new ForbiddenException(
          `This voucher is exclusively for ${promotion.apply_rank_code} members. Your current rank is ${customer.current_rank_code || 'BRONZE'}.`
        );
      }
    }

    // 5. Existing collection check (using unique compound key)
    const existing = await this.prisma.user_vouchers.findUnique({
      where: {
        user_id_promotion_id: {
          user_id: userId,
          promotion_id: promotionId,
        },
      },
    });
    if (existing) {
      throw new BadRequestException('You have already collected this voucher.');
    }

    // 6. Transactional collection
    return this.prisma.$transaction(async (tx) => {
      // Re-verify quota inside transaction for Atomic increment
      if (promotion.max_quantity) {
        const result = await tx.promotions.updateMany({
          where: {
            promotion_id: promotionId,
            collected_quantity: { lt: promotion.max_quantity },
          },
          data: { collected_quantity: { increment: 1 } },
        });
        if (result.count === 0) {
          throw new BadRequestException('Voucher is out of stock.');
        }
      } else {
        await tx.promotions.update({
          where: { promotion_id: promotionId },
          data: { collected_quantity: { increment: 1 } },
        });
      }

      // Create user voucher (wallet entry)
      const wallet = await tx.user_vouchers.create({
        data: {
          user_id: userId,
          promotion_id: promotionId,
          status: 'COLLECTED', // Explicitly set status from enum
        },
        include: { promotions: true },
      });

      return { success: true, message: 'Voucher collected successfully', voucher: wallet };
    });
  }

  /**
   * GET /promotions/my-vouchers  (also accessible via GET /users/me/vouchers)
   * Returns full voucher wallet with promotion details.
   * Auto-marks EXPIRED vouchers in background.
   */
  async getMyVouchers(userId: number) {
    const now = new Date();

    // Auto-expire stale COLLECTED vouchers (fire-and-forget)
    this._autoExpireVouchers(userId, now).catch(err =>
      this.logger.error('[AutoExpire] Failed to expire vouchers', err)
    );

    return this.prisma.user_vouchers.findMany({
      where: {
        user_id: userId,
        status: { in: ['COLLECTED', 'USED', 'EXPIRED'] },
      },
      include: {
        promotions: {
          select: {
            promotion_id: true,
            code: true,
            discount_value: true,
            discount_type: true,
            min_order_value: true,
            max_discount_amount: true,
            apply_rank_code: true,
            start_date: true,
            end_date: true,
            is_public: true,
          },
        },
      },
      orderBy: { collected_at: 'desc' },
    });
  }

  /**
   * Background job: marks COLLECTED vouchers EXPIRED if their promotion has ended.
   */
  private async _autoExpireVouchers(userId: number, now: Date) {
    await this.prisma.user_vouchers.updateMany({
      where: {
        user_id: userId,
        status: 'COLLECTED',
        promotions: {
          end_date: { lt: now, not: null },
        },
      },
      data: { status: 'EXPIRED' },
    });
  }

  // ─── Cron Jobs ─────────────────────────────────────────────────────────────

  /**
   * CRON: Runs every minute.
   * Global auto-expire for all users' COLLECTED vouchers whose promotions ended.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredVouchers() {
    const now = new Date();

    const expiredPromos = await this.prisma.promotions.findMany({
      where: { 
        end_date: { not: null, lt: now },
        is_active: true
      },
      select: { promotion_id: true, code: true },
    });

    if (expiredPromos.length > 0) {
      const ids = expiredPromos.map(v => v.promotion_id);
      const codes = expiredPromos.map(v => v.code).join(', ');

      // 1. Mark collected-but-unused vouchers as EXPIRED
      await this.prisma.user_vouchers.updateMany({
        where: { promotion_id: { in: ids }, status: 'COLLECTED' },
        data: { status: 'EXPIRED' },
      });

      // 2. Mark promotions as Inactive (Expired)
      await this.prisma.promotions.updateMany({
        where: { promotion_id: { in: ids } },
        data: { is_active: false },
      });

      this.logger.log(
        `[AutoExpire] Marked ${ids.length} promotions as inactive. Codes: [${codes}]`
      );
    }
  }
}
