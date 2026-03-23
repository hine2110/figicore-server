import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductPromotionDto } from './dto/create-product-promotion.dto';
import { UpdateProductPromotionDto } from './dto/update-product-promotion.dto';

/** Returns current time as "HH:mm" string in local time */
function nowTimeString(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
@Injectable()
export class ProductPromotionsService {
  private readonly logger = new Logger(ProductPromotionsService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProductPromotionDto) {
    // Validate time range
    if (dto.start_time >= dto.end_time) {
      throw new BadRequestException('end_time must be after start_time');
    }

    return this.prisma.product_promotions.create({
      data: {
        name: dto.name,
        type_code: dto.type_code,
        value: dto.value,
        start_time: dto.start_time,
        end_time: dto.end_time,
        is_recurring: dto.is_recurring ?? false,
        is_active: dto.is_active ?? true,
        min_apply_price: dto.min_apply_price,
        max_apply_price: dto.max_apply_price,
      },
    });
  }

  async findAll() {
    return this.prisma.product_promotions.findMany({
      where: { deleted_at: null },
      orderBy: { created_at: 'desc' },
      include: {
        _count: {
          select: { product_variants: true }
        }
      }
    });
  }

  async findOne(id: number) {
    const promo = await this.prisma.product_promotions.findUnique({
      where: { promotion_id: id },
      include: { product_variants: { select: { variant_id: true, sku: true, option_name: true } } }
    });
    if (!promo) throw new BadRequestException('Promotion not found');
    return promo;
  }

  async update(id: number, dto: UpdateProductPromotionDto) {
    const promo = await this.findOne(id);

    const newStart = dto.start_time ?? promo.start_time;
    const newEnd = dto.end_time ?? promo.end_time;
    if (newStart >= newEnd) {
      throw new BadRequestException('end_time must be after start_time');
    }

    return this.prisma.product_promotions.update({
      where: { promotion_id: id },
      data: {
        name: dto.name !== undefined ? dto.name : promo.name,
        type_code: dto.type_code !== undefined ? dto.type_code : promo.type_code,
        value: dto.value !== undefined ? dto.value : promo.value,
        start_time: newStart,
        end_time: newEnd,
        is_recurring: dto.is_recurring !== undefined ? dto.is_recurring : promo.is_recurring,
        is_active: dto.is_active !== undefined ? dto.is_active : promo.is_active,
        min_apply_price: dto.min_apply_price !== undefined ? dto.min_apply_price : promo.min_apply_price,
        max_apply_price: dto.max_apply_price !== undefined ? dto.max_apply_price : promo.max_apply_price,
      },
    });
  }

  async applyToProducts(id: number, productIds: number[]) {
    await this.findOne(id);
    return this.prisma.product_variants.updateMany({
      where: { product_id: { in: productIds } },
      data: { product_promotion_id: id }
    });
  }

  async applyToVariants(id: number, variantIds: number[]) {
    await this.findOne(id);
    return this.prisma.product_variants.updateMany({
      where: { variant_id: { in: variantIds } },
      data: { product_promotion_id: id }
    });
  }

  async removeFromProducts(id: number, productIds: number[]) {
    return this.prisma.product_variants.updateMany({
      where: {
        product_id: { in: productIds },
        product_promotion_id: id
      },
      data: { product_promotion_id: null }
    });
  }

  async remove(id: number) {
    return this.prisma.product_promotions.update({
      where: { promotion_id: id },
      data: {
        deleted_at: new Date(),
        is_active: false
      }
    });
  }

  async previewByPriceRange(id: number, minPrice: number, maxPrice: number) {
    const currentTime = nowTimeString();
    const variants = await this.prisma.product_variants.findMany({
      where: {
        price: { gte: minPrice, lte: maxPrice },
        products: { type_code: 'RETAIL' }
      },
      select: {
        variant_id: true,
        sku: true,
        option_name: true,
        products: { select: { name: true } },
        product_promotion_id: true,
        product_promotions: {
          select: {
            promotion_id: true,
            name: true,
            value: true,
            end_time: true,
            is_active: true
          }
        }
      }
    });

    const safe: any[] = [];
    const conflicts: any[] = [];

    for (const v of variants) {
      const promo = v.product_promotions;
      const hasActivePromo = promo &&
        promo.is_active;

      const vName = `${v.products?.name || 'Product'} - ${v.option_name}`;

      if (hasActivePromo) {
        conflicts.push({
          product_id: v.variant_id,
          name: vName,
          current_promotion: {
            promotion_id: promo.promotion_id,
            name: promo.name,
            value: promo.value,
            end_time: promo.end_time
          }
        });
      } else {
        safe.push({ product_id: v.variant_id, name: vName });
      }
    }

    return {
      safe_count: safe.length,
      conflict_count: conflicts.length,
      safe_products: safe,
      conflict_products: conflicts
    };
  }

  async applyToPriceRange(id: number, minPrice: number, maxPrice: number, overwrite: boolean = true) {
    const variants = await this.prisma.product_variants.findMany({
      where: {
        price: { gte: minPrice, lte: maxPrice },
        products: { type_code: 'RETAIL' }
      },
      select: {
        variant_id: true,
        product_promotion_id: true,
        product_promotions: {
          select: { is_active: true }
        }
      }
    });

    const toApply = variants.filter(v => {
      const hasActivePromo = v.product_promotions?.is_active;
      return overwrite ? true : !hasActivePromo;
    });

    if (toApply.length === 0) {
      return { count: 0, message: 'No variants to apply (all have active promotions and overwrite is off)' };
    }

    const variantIds = toApply.map(v => v.variant_id);
    const updateResult = await this.prisma.product_variants.updateMany({
      where: { variant_id: { in: variantIds } },
      data: { product_promotion_id: id }
    });

    return {
      count: updateResult.count,
      message: `Successfully applied promotion to ${updateResult.count} variants`,
      skipped: variants.length - updateResult.count
    };
  }

  /**
   * CRON: Runs every minute to check if non-recurring active promotions are outside their time window
   * and deactivates them (so they don't run the next day).
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredPromotions() {
    const currentTime = nowTimeString();

    // Find active, NON-recurring promotions whose window has passed today
    const expiredPromotions = await this.prisma.product_promotions.findMany({
      where: {
        is_active: true,
        is_recurring: false,
        end_time: { lt: currentTime },
        deleted_at: null,
      }
    });

    if (expiredPromotions.length > 0) {
      const promotionIds = expiredPromotions.map(p => p.promotion_id);

      // Unlink from variants
      await this.prisma.product_variants.updateMany({
        where: { product_promotion_id: { in: promotionIds } },
        data: { product_promotion_id: null }
      });

      // Deactivate the promotion (it won't run tomorrow)
      await this.prisma.product_promotions.updateMany({
        where: { promotion_id: { in: promotionIds } },
        data: { is_active: false, deleted_at: new Date() }
      });

      this.logger.log(`Deactivated ${promotionIds.length} expired non-recurring promotions: [${promotionIds.join(', ')}]`);
    }
  }
}
