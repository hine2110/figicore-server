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
    // Only send emails if a specific rank is targeted. We don't want to spam everyone for "All Customer" vouchers.
    if (promotion.apply_rank_code) {
      this._dispatchTargetedPromotionEmails(promotion).catch((err) =>
        this.logger.error(`[PromotionsService] Background email dispatch failed for promotion #${promotion.promotion_id}`, err),
      );
    }

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

  async findAll(query: {
    page?: number;
    limit?: number;
    search?: string;
    type?: string;
    status?: string;
    rank?: string;
  }) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 10);
    const skip = (page - 1) * limit;

    const where: any = { deleted_at: null };

    if (query.search) {
      where.code = { contains: query.search, mode: 'insensitive' };
    }

    if (query.type && query.type !== 'ALL') {
      where.discount_type = query.type;
    }

    if (query.rank && query.rank !== 'ALL') {
      where.apply_rank_code = query.rank;
    }

    if (query.status && query.status !== 'ALL') {
      const now = new Date();
      if (query.status === 'PUBLIC') {
        where.is_public = true;
        where.is_active = true;
        where.OR = [
          { end_date: null },
          { end_date: { gt: now } }
        ];
      } else if (query.status === 'EXPIRED') {
        where.OR = [
          { is_active: false },
          { end_date: { lt: now } }
        ];
      } else if (query.status === 'HIDDEN') {
        where.is_public = false;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.promotions.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.promotions.count({ where }),
    ]);

    return { data, total };
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

    // Get rank hierarchy
    const rankLookups = await this.prisma.system_lookups.findMany({
      where: { type: 'CUSTOMER_RANK' },
    });
    const rankOrderMap = new Map(rankLookups.map((r) => [r.code, r.sort_order]));
    const userRankOrder = rankOrderMap.get(rankCode) || 1;

    // Fetch ALL public promotions (ignoring rank filter)
    const promotions = await this.prisma.promotions.findMany({
      where: {
        is_public: true,
      },
      orderBy: { created_at: 'desc' },
    });

    const collected = await this.prisma.user_vouchers.findMany({
      where: { user_id: userId },
      select: { promotion_id: true },
    });
    const collectedIds = new Set(collected.map((c) => c.promotion_id));

    const now = new Date();
    return promotions
      .filter((p) => !collectedIds.has(p.promotion_id))
      .filter((p) => !(p.max_quantity && (p.collected_quantity || 0) >= p.max_quantity))
      .filter((p) => !p.end_date || new Date(p.end_date) >= now)
      .map((p) => {
        const requiredRankOrder = p.apply_rank_code
          ? rankOrderMap.get(p.apply_rank_code) || 0
          : 0;
        const isEligible = userRankOrder >= requiredRankOrder;

        return {
          ...p,
          is_collected: false,
          can_collect: isEligible,
          is_out_of_stock: false,
        };
      });
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

      const rankCode = customer.current_rank_code || 'BRONZE';

      // Load rank hierarchy
      const rankLookups = await this.prisma.system_lookups.findMany({
        where: { type: 'CUSTOMER_RANK' },
      });
      const rankOrderMap = new Map(rankLookups.map((r) => [r.code, r.sort_order]));

      const userRankOrder = rankOrderMap.get(rankCode) || 1;
      const requiredRankOrder = rankOrderMap.get(promotion.apply_rank_code) || 0;

      if (userRankOrder < requiredRankOrder) {
        throw new ForbiddenException(
          `This voucher is exclusively for ${promotion.apply_rank_code} members or above. Your current rank is ${rankCode}.`
        );
      }
    }

    // 6. Transactional collection
    try {
      return await this.prisma.$transaction(async (tx) => {
        // 5. Existing collection check (Move inside transaction for Atomicity)
        const existing = await tx.user_vouchers.findUnique({
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
    } catch (error) {
      if (error.code === 'P2002') {
        throw new BadRequestException('You have already collected this voucher.');
      }
      throw error;
    }
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

  // ─── Apology Voucher ──────────────────────────────────────────────────

  async createApologyVoucher(email: string) {
    if (!email) {
      throw new BadRequestException('Email is required');
    }

    const encryptedEmail = this.encryption.encryptDeterministic(email);
    const user = await this.prisma.users.findUnique({
      where: { email: encryptedEmail },
      include: { customers: true },
    });

    if (!user) {
      throw new NotFoundException('Account with this email not found.');
    }

    if (!user.customers) {
      throw new BadRequestException('This email does not belong to a customer account.');
    }

    const shortId = Math.random().toString(36).substring(2, 6).toUpperCase();
    const code = `APOLOGY-${shortId}${user.user_id}`;
    
    const now = new Date();
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30); // 30 days validity

    return await this.prisma.$transaction(async (tx) => {
      // 1. Target Create Promotion (is_public = false)
      const promotion = await tx.promotions.create({
        data: {
          code,
          discount_type: 'PERCENTAGE',
          discount_value: 15, // 15% off
          max_discount_amount: 150000, // Capped at 150.000 VNĐ
          min_order_value: 0,
          is_public: false,
          is_active: true,
          max_quantity: 1,
          collected_quantity: 1, // Already marked as collected
          start_date: now,
          end_date: expiry,
        },
      });

      // 2. Put straight into customer's wallet
      await tx.user_vouchers.create({
        data: {
          user_id: user.user_id,
          promotion_id: promotion.promotion_id,
        },
      });

      // 3. Send email asynchronously (fire & forget)
      const decryptedName = user.full_name ? this.encryption.decrypt(user.full_name) : 'Customer';
      this.mailService.sendApologyEmail(
        { email, full_name: decryptedName },
        promotion
      ).catch((err) => console.error('[Apology Voucher]', err));

      return {
        success: true,
        message: 'Apology voucher sent successfully.',
        data: promotion
      };
    });
  }
}
