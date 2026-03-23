import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
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

  /**
   * Cross-check every Flash Sale item's price against the DB price.
   * Throws BadRequestException if any item fails validation.
   */
  private async _validateFlashSaleItems(
    items: { variant_id: number; flash_sale_price: number; quota: number }[]
  ) {
    for (const item of items) {
      // 1. flash_sale_price must be a positive number
      if (item.flash_sale_price <= 0) {
        throw new BadRequestException(
          `Invalid flash_sale_price for variant #${item.variant_id}: price must be greater than 0.`
        );
      }

      // 2. quota must be a positive integer
      if (!item.quota || item.quota <= 0) {
        throw new BadRequestException(
          `Invalid quota for variant #${item.variant_id}: quota must be greater than 0.`
        );
      }

      // 3. Cross-check against actual DB price
      const variant = await this.prisma.product_variants.findUnique({
        where: { variant_id: item.variant_id },
        select: { price: true, stock_available: true, sku: true }
      });

      if (!variant) {
        throw new BadRequestException(`Variant #${item.variant_id} not found.`);
      }

      const originalPrice = Number(variant.price);

      if (item.flash_sale_price >= originalPrice) {
        throw new BadRequestException(
          `Flash sale price (${item.flash_sale_price}) for variant "${variant.sku}" ` +
          `must be strictly less than the original price (${originalPrice}).`
        );
      }

      // 4. Quota cannot exceed available stock
      if (item.quota > variant.stock_available) {
        throw new BadRequestException(
          `Quota (${item.quota}) for variant "${variant.sku}" exceeds ` +
          `available stock (${variant.stock_available}).`
        );
      }
    }
  }


  async create(dto: CreateProductPromotionDto) {
    // Validate time range: only enforce start_time < end_time when on the SAME date.
    // If start_date !== end_date, the date range already establishes order.
    const sameDay = !dto.start_date || !dto.end_date || dto.start_date === dto.end_date;
    if (sameDay && dto.start_time >= dto.end_time) {
      throw new BadRequestException('end_time must be after start_time (when start and end are on the same date)');
    }

    // --- SECURITY: Cross-check flash_sale_price vs DB price ---
    if (dto.is_flash_sale && dto.items && dto.items.length > 0) {
      await this._validateFlashSaleItems(dto.items);
    }

    const promo = await this.prisma.product_promotions.create({
      data: {
        name: dto.name,
        type_code: dto.type_code,
        value: dto.value,
        start_time: dto.start_time,
        end_time: dto.end_time,
        start_date: dto.start_date ? new Date(dto.start_date) : undefined,
        end_date: dto.end_date ? new Date(dto.end_date) : undefined,
        is_recurring: dto.is_recurring ?? false,
        is_active: dto.is_active ?? true,
        min_apply_price: dto.min_apply_price,
        max_apply_price: dto.max_apply_price,
        is_flash_sale: dto.is_flash_sale ?? false,
      },
    });

    if (dto.is_flash_sale && dto.items && dto.items.length > 0) {
      for (const item of dto.items) {
        await this.prisma.promotion_items.create({
          data: {
            promotion_id: promo.promotion_id,
            variant_id: item.variant_id,
            flash_sale_price: item.flash_sale_price,
            quota: item.quota,
            sold: 0
          }
        });

        // --- FIX: Snapshot current promotion before Flash Sale overwrites it ---
        const currentVariant = await this.prisma.product_variants.findUnique({
          where: { variant_id: item.variant_id },
          select: { product_promotion_id: true }
        });
        await this.prisma.product_variants.update({
          where: { variant_id: item.variant_id },
          data: {
            previous_promotion_id: currentVariant?.product_promotion_id ?? null,
            product_promotion_id: promo.promotion_id
          }
        });
      }
    }

    return promo;
  }

  async findAll() {
    return this.prisma.product_promotions.findMany({
      where: { deleted_at: null },
      orderBy: { created_at: 'desc' },
      include: {
        _count: {
          select: { product_variants: true }
        },
        promotion_items: {
          include: {
            product_variants: {
              select: { price: true }
            }
          }
        }
      }
    });
  }

  /** Public: returns currently-active Flash Sale items for the Storefront. */
  async findActiveFlashSales() {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const activePromos = await this.prisma.product_promotions.findMany({
      where: {
        is_flash_sale: true,
        is_active: true,
        deleted_at: null,
        OR: [
          // If recurring, we fetch all that match the date range (or no range)
          {
            is_recurring: true,
            OR: [
              { start_date: null },
              {
                start_date: { lte: now },
                end_date: { gte: now },
              }
            ]
          },
          // If NOT recurring, strict DateTime match
          {
            is_recurring: false,
            start_date: { lte: now },
            end_date: { gt: now },
          }
        ]
      },
      include: {
        promotion_items: {
          include: {
            product_variants: {
              select: {
                variant_id: true,
                price: true,
                stock_available: true,
                products: {
                  select: {
                    product_id: true,
                    name: true,
                    media_urls: true,
                    brands: { select: { name: true } }
                  }
                }
              }
            }
          }
        }
      }
    });

    // In-memory filter for recurring HH:mm windows
    const filteredPromos = activePromos.filter(promo => {
      if (!promo.is_recurring) return true; // Already date-filtered by Prisma
      
      const start = promo.start_time; // "HH:mm"
      const end = promo.end_time;     // "HH:mm"
      if (!start || !end) return false;

      // Handle 24h case: same start and end time
      if (start === end) return true;

      // Handle overnight window (e.g., 22:00 to 02:00) vs Normal window (10:00 to 12:00)
      if (start < end) {
        return timeStr >= start && timeStr < end;
      } else {
        // Overnight: it's active if (now >= start) OR (now < end)
        return timeStr >= start || timeStr < end;
      }
    });

    // Flatten promotion_items into a customer-ready list
    const items: any[] = [];
    for (const promo of filteredPromos) {
      // Build ISO strings from time strings + today's date for the timer
      const todayStr = now.toISOString().split('T')[0];
      let endTimeISO = `${todayStr}T${promo.end_time}:00`;

      // Handle overnight window for the timer:
      // If start > end (overnight) AND we are currently in the "late night" part (timeStr >= start),
      // then the end_time is actually TOMORROW.
      if (promo.is_recurring && promo.start_time && promo.end_time && promo.start_time > promo.end_time) {
        if (timeStr >= promo.start_time) {
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowStr = tomorrow.toISOString().split('T')[0];
          endTimeISO = `${tomorrowStr}T${promo.end_time}:00`;
        }
      }

      for (const pi of promo.promotion_items) {
        const v = pi.product_variants;
        if (!v) continue;
        const p = v.products;
        if (!p) continue;

        items.push({
          promotion_id:    promo.promotion_id,
          promotion_name:  promo.name,
          variant_id:      pi.variant_id,
          product_id:      p.product_id,
          name:            p.name,
          image:           p.media_urls?.[0] ?? null,
          brand:           p.brands?.name ?? null,
          is_flash_sale:   true,
          flash_sale_price: Number(pi.flash_sale_price),
          original_price:  Number(v.price),
          sold:            pi.sold ?? 0,
          quota:           pi.quota,
          start_time:      `${todayStr}T${promo.start_time}:00`,
          end_time:        endTimeISO,
        });
      }
    }

    return items;
  }


  async findOne(id: number) {
    const promo = await this.prisma.product_promotions.findUnique({
      where: { promotion_id: id },
      include: { 
        product_variants: {
          select: {
            variant_id: true,
            sku: true,
            option_name: true,
            price: true,
            products: { select: { name: true } }
          }
        },
        promotion_items: {
          include: {
            product_variants: {
              select: {
                sku: true,
                option_name: true,
                cost_price: true,
                price: true,
                stock_available: true,
                products: { select: { name: true } }
              }
            }
          }
        }
      }
    });
    if (!promo) throw new BadRequestException('Promotion not found');
    return promo;
  }

  async update(id: number, dto: UpdateProductPromotionDto) {
    const promo = await this.findOne(id);

    const newStart = dto.start_time ?? promo.start_time;
    const newEnd = dto.end_time ?? promo.end_time;
    const newStartDate = dto.start_date ?? promo.start_date?.toISOString().split('T')[0];
    const newEndDate = dto.end_date ?? promo.end_date?.toISOString().split('T')[0];
    const sameDay = !newStartDate || !newEndDate || newStartDate === newEndDate;
    if (sameDay && newStart >= newEnd) {
      throw new BadRequestException('end_time must be after start_time (when start and end are on the same date)');
    }

    // --- SECURITY: Cross-check flash_sale_price vs DB price (if updating items) ---
    const isFlashSale = dto.is_flash_sale !== undefined ? dto.is_flash_sale : promo.is_flash_sale;
    if (isFlashSale && dto.items && dto.items.length > 0) {
      await this._validateFlashSaleItems(dto.items);
    }

    const updatedPromo = await this.prisma.product_promotions.update({
      where: { promotion_id: id },
      data: {
        name: dto.name !== undefined ? dto.name : promo.name,
        type_code: dto.type_code !== undefined ? dto.type_code : promo.type_code,
        value: dto.value !== undefined ? dto.value : promo.value,
        start_time: newStart,
        end_time: newEnd,
        start_date: dto.start_date ? new Date(dto.start_date) : undefined,
        end_date: dto.end_date ? new Date(dto.end_date) : undefined,
        is_recurring: dto.is_recurring !== undefined ? dto.is_recurring : promo.is_recurring,
        is_active: dto.is_active !== undefined ? dto.is_active : promo.is_active,
        min_apply_price: dto.min_apply_price !== undefined ? dto.min_apply_price : promo.min_apply_price,
        max_apply_price: dto.max_apply_price !== undefined ? dto.max_apply_price : promo.max_apply_price,
        is_flash_sale: isFlashSale,
      },
    });

    if (isFlashSale && dto.items !== undefined) {
      const oldItems = await this.prisma.promotion_items.findMany({ where: { promotion_id: id } });
      const oldVariantIds = oldItems.map(i => i.variant_id);
      const newVariantIds = dto.items.map(i => i.variant_id);

      const toRemove = oldVariantIds.filter(v_id => !newVariantIds.includes(v_id));

      for (const variantId of toRemove) {
        const v = await this.prisma.product_variants.findUnique({ where: { variant_id: variantId } });
        if (v && v.product_promotion_id === id) {
          await this.prisma.product_variants.update({
            where: { variant_id: variantId },
            data: {
              product_promotion_id: v.previous_promotion_id,
              previous_promotion_id: null
            }
          });
        }
        const oldItem = oldItems.find(i => i.variant_id === variantId);
        if (oldItem) {
          await this.prisma.promotion_items.delete({ where: { item_id: oldItem.item_id } });
        }
      }

      for (const item of dto.items) {
        const existingItem = oldItems.find(i => i.variant_id === item.variant_id);
        if (existingItem) {
          await this.prisma.promotion_items.update({
            where: { item_id: existingItem.item_id },
            data: { flash_sale_price: item.flash_sale_price, quota: item.quota }
          });
        } else {
          await this.prisma.promotion_items.create({
            data: {
              promotion_id: id,
              variant_id: item.variant_id,
              flash_sale_price: item.flash_sale_price,
              quota: item.quota,
              sold: 0
            }
          });
          const v = await this.prisma.product_variants.findUnique({ where: { variant_id: item.variant_id } });
          await this.prisma.product_variants.update({
            where: { variant_id: item.variant_id },
            data: {
              previous_promotion_id: v?.product_promotion_id ?? null,
              product_promotion_id: id
            }
          });
        }
      }
    }

    return updatedPromo;
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
    const variants = await this.prisma.product_variants.findMany({
      where: {
        price: { gte: minPrice, lte: maxPrice },
        products: { type_code: 'RETAIL' }
      },
      select: {
        variant_id: true,
        sku: true,
        option_name: true,
        price: true,
        cost_price: true,
        products: { select: { name: true } },
        product_promotion_id: true,
        product_promotions: {
          select: {
            promotion_id: true,
            name: true,
            value: true,
            end_time: true,
            is_active: true,
            is_flash_sale: true,
          }
        }
      }
    });

    const safe: any[] = [];
    const conflicts: any[] = [];

    for (const v of variants) {
      const promo = v.product_promotions;
      // Exclude the current promotion being edited (id > 0 check = create mode uses id=0)
      const hasActivePromo = promo && promo.is_active && promo.promotion_id !== id;

      const vName = `${v.products?.name || 'Product'} - ${v.option_name}`;

      if (hasActivePromo) {
        conflicts.push({
          product_id: v.variant_id,
          name: vName,
          price: Number(v.price),
          cost_price: Number(v.cost_price || 0),
          current_promotion: {
            promotion_id: promo.promotion_id,
            name: promo.name,
            value: promo.value,
            end_time: promo.end_time,
            is_flash_sale: promo.is_flash_sale,
          }
        });
      } else {
        safe.push({ 
          product_id: v.variant_id, 
          name: vName,
          price: Number(v.price),
          cost_price: Number(v.cost_price || 0),
        });
      }
    }

    return {
      safe_count: safe.length,
      conflict_count: conflicts.length,
      safe_products: safe,
      conflict_products: conflicts
    };
  }

  async previewByVariantIds(variantIds: number[], currentPromotionId?: number) {
    if (!variantIds || variantIds.length === 0) {
      return { safe_count: 0, conflict_count: 0, safe_products: [], conflict_products: [] };
    }

    const variants = await this.prisma.product_variants.findMany({
      where: {
        variant_id: { in: variantIds }
      },
      select: {
        variant_id: true,
        sku: true,
        option_name: true,
        price: true,
        cost_price: true,
        products: { select: { name: true } },
        product_promotion_id: true,
        product_promotions: {
          select: {
            promotion_id: true,
            name: true,
            value: true,
            end_time: true,
            is_active: true,
            is_flash_sale: true
          }
        }
      }
    });

    const safe: any[] = [];
    const conflicts: any[] = [];

    for (const v of variants) {
      const promo = v.product_promotions;
      const hasConflict = promo && promo.is_active && promo.promotion_id !== currentPromotionId;

      const vName = `${v.products?.name || 'Product'} - ${v.option_name}`;

      if (hasConflict) {
        conflicts.push({
          variant_id: v.variant_id,
          name: vName,
          price: Number(v.price),
          cost_price: Number(v.cost_price || 0),
          current_promotion: {
            promotion_id: promo.promotion_id,
            name: promo.name,
            value: promo.value,
            end_time: promo.end_time,
            is_flash_sale: promo?.is_flash_sale
          }
        });
      } else {
        safe.push({ 
          variant_id: v.variant_id, 
          name: vName,
          price: Number(v.price),
          cost_price: Number(v.cost_price || 0),
        });
      }
    }

    return {
      safe_count: safe.length,
      conflict_count: conflicts.length,
      safe_variants: safe,
      conflict_variants: conflicts
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
   * CRON: Runs every minute.
   *
   * PHASE 1 — Expire: Find active promotions whose time window has passed.
   *   → Restore variant promotion links, set is_active=false, deleted_at=now (marks expiry time).
   *
   * PHASE 2 — Hard Delete: Find soft-deleted promotions where deleted_at > 10 minutes ago.
   *   → Delete promotion_items (FK), then hard-delete product_promotions record.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredPromotions() {
    const now = new Date();
    const currentTime = nowTimeString();

    // ── PHASE 1: Deactivate expired promotions ──────────────────────────
    const expiredActive = await this.prisma.product_promotions.findMany({
      where: {
        is_active: true,
        deleted_at: null,
        OR: [
          {
            is_recurring: false,
            end_date: null,
            end_time: { lt: currentTime }
          },
          {
            end_date: { lt: now }
          }
        ]
      }
    });

    if (expiredActive.length > 0) {
      const promotionIds = expiredActive.map(p => p.promotion_id);

      // Restore previous_promotion_id per-variant
      const affectedVariants = await this.prisma.product_variants.findMany({
        where: { product_promotion_id: { in: promotionIds } },
        select: { variant_id: true, previous_promotion_id: true }
      });

      for (const v of affectedVariants) {
        try {
          await this.prisma.product_variants.update({
            where: { variant_id: v.variant_id },
            data: {
              product_promotion_id: v.previous_promotion_id,
              previous_promotion_id: null
            }
          });
        } catch (error) {
          await this.prisma.product_variants.update({
            where: { variant_id: v.variant_id },
            data: {
              product_promotion_id: null,
              previous_promotion_id: null
            }
          });
        }
      }

      // Mark as expired (deleted_at = expiry timestamp, used for 10-min grace period)
      await this.prisma.product_promotions.updateMany({
        where: { promotion_id: { in: promotionIds } },
        data: { is_active: false, deleted_at: new Date() }
      });

      this.logger.log(
        `[Phase 1] Expired ${promotionIds.length} product promotions. ` +
        `Restored ${affectedVariants.length} variant promotions. ` +
        `IDs: [${promotionIds.join(', ')}]`
      );
    }

    // ── PHASE 2: Hard delete promotions expired > 10 minutes ago ───────
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const toHardDelete = await this.prisma.product_promotions.findMany({
      where: {
        is_active: false,
        deleted_at: { not: null, lt: tenMinutesAgo }
      },
      select: { promotion_id: true }
    });

    if (toHardDelete.length > 0) {
      const deleteIds = toHardDelete.map(p => p.promotion_id);

      // Delete promotion_items first (FK constraint)
      await this.prisma.promotion_items.deleteMany({
        where: { promotion_id: { in: deleteIds } }
      });

      // Hard delete the promotion records
      await this.prisma.product_promotions.deleteMany({
        where: { promotion_id: { in: deleteIds } }
      });

      this.logger.log(
        `[Phase 2] Hard-deleted ${deleteIds.length} expired product promotions after 10-min grace period. ` +
        `IDs: [${deleteIds.join(', ')}]`
      );
    }
  }
}
