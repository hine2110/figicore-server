import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { CreateCartDto } from './dto/create-cart.dto';
import { UpdateCartDto } from './dto/update-cart.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) { }

  // Shared helper to safely check Promo active state and timestamps
  private isActivePromo(promo: any, now: Date = new Date()): boolean {
    if (!promo || !promo.is_active) return false;

    // 1. Master Date Range Guard (Check if today is within the allowed month/range)
    if (promo.start_date) {
        const start = new Date(promo.start_date);
        start.setHours(0, 0, 0, 0); // Include the full start day
        if (now < start) return false;
    }
    if (promo.end_date) {
        const end = new Date(promo.end_date);
        end.setHours(23, 59, 59, 999); // Include the full end day
        if (now > end) return false;
    }

    const startStr = promo.start_time || "00:00";
    const endStr = promo.end_time || "23:59";

    if (promo.is_recurring) {
      // 2. Daily Time Window Check (e.g., 13:00 - 15:00 EVERY DAY)
      const h = now.getHours();
      const m = now.getMinutes();
      const currentTimeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

      if (startStr === endStr) return true; // 24h behavior
      
      if (startStr < endStr) {
        // Normal Window (e.g., 10:00 - 12:00)
        return currentTimeStr >= startStr && currentTimeStr < endStr;
      } else {
        // Overnight Window (e.g., 22:00 - 02:00)
        return currentTimeStr >= startStr || currentTimeStr < endStr;
      }
    } else {
      // 3. Non-recurring: Strict absolute LocalDateTime comparison
      const [startHH, startMM] = startStr.split(':').map(Number);
      const [endHH, endMM] = endStr.split(':').map(Number);

      const promoStart = promo.start_date ? new Date(promo.start_date) : new Date(now);
      promoStart.setHours(startHH, startMM, 0, 0);

      const promoEnd = promo.end_date ? new Date(promo.end_date) : new Date(now);
      promoEnd.setHours(endHH, endMM, 59, 999);

      return now >= promoStart && now <= promoEnd;
    }
  }

  // Helper to find or create cart for user
  private async getOrCreateCart(userId: number) {
    let cart = await this.prisma.carts.findFirst({
      where: { user_id: userId, deleted_at: null },
    });

    if (!cart) {
      cart = await this.prisma.carts.create({
        data: { user_id: userId },
      });
    }
    return cart;
  }

  async addToCart(userId: number, dto: CreateCartDto) {
    const { productId, variantId, quantity } = dto;

    if (!variantId) {
      // For now, demand variantId. If logic changes later to support product-level add, handle here.
      throw new BadRequestException('Variant ID is currently required');
    }

    // 1. Validate Product & Variant & Stock
    const variant = await this.prisma.product_variants.findUnique({
      where: { variant_id: variantId },
      include: {
        products: true,
        product_preorder_configs: true, // NEW: Fetch configs
        product_promotions: {
          include: { promotion_items: true }
        }
      }
    });

    if (!variant) throw new NotFoundException('Variant not found');
    if (variant.product_id !== productId) throw new BadRequestException('Mismatch between Product and Variant');

    // BRANCHED VALIDATION: Pre-order vs Retail vs Blindbox
    if (variant.products.type_code === 'PREORDER' || variant.product_preorder_configs) {
      // Pre-order Validation: Check Slots
      const def = variant.product_preorder_configs;
      if (!def) {
        throw new BadRequestException('Pre-order configuration missing');
      }

      const currentSold = def.sold_slots || 0;
      const limit = def.total_slots || 0;

      if (currentSold + quantity > limit) {
        throw new BadRequestException(`Pre-order slots full. Remaining: ${Math.max(0, limit - currentSold)}`);
      }
    } else if (variant.products.type_code === 'BLINDBOX') {
      // BLINDBOX: Dynamic Stock Check against the Prize Pool
      const bbConfig = await this.prisma.product_blindboxes.findFirst({
        where: { product_id: variant.product_id }
      });

      if (bbConfig) {
        const aggregation = await this.prisma.product_variants.aggregate({
          _sum: {
            stock_available: true,
            stock_defect: true
          },
          where: {
            products: { type_code: 'RETAIL', status_code: 'ACTIVE' },
            price: {
              gte: Number(bbConfig.min_value),
              lte: Number(bbConfig.max_value)
            },
            deleted_at: null
          }
        });

        const dynamicStock = (aggregation._sum.stock_available || 0) + (aggregation._sum.stock_defect || 0);

        if (quantity > dynamicStock) {
          throw new BadRequestException("Rất tiếc, số lượng vật phẩm trong kho báu này đã cạn kiệt.");
        }
      }
    } else {
      // Retail Validation: Check Physical Stock
      if (variant.stock_available < quantity) {
        throw new BadRequestException(`Insufficient stock. Available: ${variant.stock_available}`);
      }

      // Flash Sale Quota Check
      const promo = variant.product_promotions;
      if (this.isActivePromo(promo) && promo?.is_flash_sale) {
        const fsItem = promo.promotion_items?.find((i: any) => i.variant_id === variantId);
        if (fsItem) {
          const limit = fsItem.quota - fsItem.sold;
          if (quantity > limit) {
            throw new BadRequestException(`Sản phẩm Flash Sale này chỉ còn ${limit} suất. Không thể thêm ${quantity}.`);
          }
        }
      }
    }

    // 2. Get User Cart
    const cart = await this.getOrCreateCart(userId);

    // --- CHECK USER LIMIT (Preorder) ---
    // Moved here to use cart.cart_id directly
    if (variant.product_preorder_configs?.max_qty_per_user) {
      const maxQty = variant.product_preorder_configs.max_qty_per_user;

      const existingQty = await this.prisma.cart_items.aggregate({
        where: {
          cart_id: cart.cart_id,
          variant_id: variantId,
          deleted_at: null
        },
        _sum: { quantity: true }
      });

      const currentQtyInCart = existingQty._sum?.quantity || 0;

      if ((currentQtyInCart + quantity) > maxQty) {
        throw new BadRequestException(`Limit exceeded. You can only buy ${maxQty} of this item.`);
      }
    }

    // 3. Upsert Item
    // FIX: Must check payment_option to avoid merging Deposit vs Full Payment
    const paymentOption = dto.paymentOption || 'DEPOSIT';

    // FIX: User cannot have the same variant with DIFFERENT payment options in the cart.
    const conflictingItem = await this.prisma.cart_items.findFirst({
      where: {
        cart_id: cart.cart_id,
        variant_id: variantId,
        payment_option: { not: paymentOption },
        deleted_at: null
      }
    });

    if (conflictingItem) {
      throw new BadRequestException(`Bạn đã có sản phẩm này trong giỏ hàng với hình thức thanh toán khác (${conflictingItem.payment_option}). Vui lòng xóa sản phẩm cũ trước khi chọn hình thức mới.`);
    }

    const existingItem = await this.prisma.cart_items.findFirst({
      where: {
        cart_id: cart.cart_id,
        variant_id: variantId,
        payment_option: paymentOption, // <--- CRITICAL FIX
        livestream_id: dto.livestreamId || null,
        deleted_at: null
      }
    });

    if (existingItem) {
      // If payment option differs -> Block (Backend Double Check)
      // Note: dto should have paymentOption. If not provided, default? 
      // Current DTO might not have paymentOption for add? Let's check DTO.
      // Assuming logic was handled in frontend, but helpful to enforce here if we had the field.

      const newQuantity = (existingItem.quantity || 1) + quantity;

      // Re-validate for the TOTAL accumulated quantity
      if (variant.products.type_code === 'PREORDER' || variant.product_preorder_configs) {
        // Re-check user limit
        const def = variant.product_preorder_configs;
        if (def?.max_qty_per_user && newQuantity > def.max_qty_per_user) {
          throw new BadRequestException(`Limit exceeded. You include this add, total would be ${newQuantity}. Max: ${def.max_qty_per_user}`);
        }

        const currentSold = def?.sold_slots || 0;
        const limit = def?.total_slots || 0;
        const availableSlots = Math.max(0, limit - currentSold);

        if (quantity > availableSlots) {
          throw new BadRequestException(`Cannot add ${quantity} more. Remaining slots: ${availableSlots}`);
        }
      } else if (variant.products.type_code === 'BLINDBOX') {
        const bbConfig = await this.prisma.product_blindboxes.findFirst({
          where: { product_id: variant.product_id }
        });

        if (bbConfig) {
          const aggregation = await this.prisma.product_variants.aggregate({
            _sum: { stock_available: true, stock_defect: true },
            where: {
              products: { type_code: 'RETAIL', status_code: 'ACTIVE' },
              price: { gte: Number(bbConfig.min_value), lte: Number(bbConfig.max_value) },
              deleted_at: null
            }
          });
          const dynamicStock = (aggregation._sum.stock_available || 0) + (aggregation._sum.stock_defect || 0);

          if (newQuantity > dynamicStock) {
            throw new BadRequestException(`Rất tiếc, kho báu chỉ còn tổng cộng ${dynamicStock} sản phẩm. Giỏ hàng của bạn đang có ${existingItem.quantity}.`);
          }
        }
      } else {
        if (variant.stock_available < newQuantity) {
          throw new BadRequestException(`Cannot add ${quantity} more. Max available: ${variant.stock_available}, In Cart: ${existingItem.quantity}`);
        }

// Standard Flash Sale Quota Check (Promotions Module)
        const promo = variant.product_promotions;
        if (this.isActivePromo(promo) && promo?.is_flash_sale) {
          const fsItem = promo.promotion_items?.find((i: any) => i.variant_id === variantId);
          if (fsItem) {
            const limit = fsItem.quota - fsItem.sold;
            if (newQuantity > limit) {
              throw new BadRequestException(`Sản phẩm Flash Sale này chỉ được mua tối đa ${limit} suất (Kể cả giỏ hàng cũ). Bạn không thể thêm nữa.`);
            }
          }
        }

        // LIVESTREAM FLASH SALE Check (Livestream Module)
        const activeLivestreamId = dto.livestreamId || existingItem.livestream_id;
        if (activeLivestreamId) {
          const liveConfig = await this.prisma.livestream_products.findUnique({
            where: { livestream_id_variant_id: { livestream_id: Number(activeLivestreamId), variant_id: variantId } }
          });
          if (liveConfig && liveConfig.flash_sale_price && Number(liveConfig.flash_sale_price) > 0) {
            const fsStockAvailable = liveConfig.flash_sale_stock || 0;
            if (newQuantity > fsStockAvailable) {
              throw new BadRequestException(`Suất Flash Sale hiện tại chỉ còn ${fsStockAvailable} suất. Bạn không thể tăng số lượng thêm nữa.`);
            }
          }
        }
      }

      await this.prisma.cart_items.update({
        where: { item_id: existingItem.item_id },
        data: {
          quantity: newQuantity,
          updated_at: new Date(),
          livestream_id: dto.livestreamId || existingItem.livestream_id
        }
      });
    } else {
      // NEW: Fresh Add - Check Current Flash Sale stock before creating
      if (dto.livestreamId) {
        const liveConfig = await this.prisma.livestream_products.findUnique({
          where: { livestream_id_variant_id: { livestream_id: Number(dto.livestreamId), variant_id: variantId } }
        });
        if (liveConfig && liveConfig.flash_sale_price && Number(liveConfig.flash_sale_price) > 0) {
          if (quantity > (liveConfig.flash_sale_stock || 0)) {
            throw new BadRequestException(`Suất Flash Sale hiện tại chỉ còn ${liveConfig.flash_sale_stock || 0} sản phẩm. Vui lòng giảm số lượng.`);
          }
        }
      }

      await this.prisma.cart_items.create({
        data: {
          cart_id: cart.cart_id,
          variant_id: variantId,
          quantity: quantity,
          payment_option: dto.paymentOption || 'DEPOSIT',
          livestream_id: dto.livestreamId || null
        }
      });
    }

    return this.getCart(userId);
  }

  async addGiveawayToCart(userId: number, claimId: number) {
    console.log(`[CartService] Entering addGiveawayToCart for User ${userId}, Claim ${claimId}`);
    
    try {
      // 1. Validate claim - Use findUnique for PK search
      const claim = await this.prisma.giveaway_claims.findUnique({
        where: { claim_id: claimId }
      });

      console.log(`[CartService] Claim Found:`, claim ? 'YES' : 'NO');

      if (!claim || claim.user_id !== userId || claim.status_code !== 'PENDING') {
        console.log(`[CartService] Validation failed. Claim: ${JSON.stringify(claim)}`);
        throw new BadRequestException("Phần thưởng không hợp lệ hoặc đã được thu thập.");
      }

      // 2. Add to cart
      console.log(`[CartService] Getting cart for User ${userId}`);
      const cart = await this.getOrCreateCart(userId);

      // Check if already in cart
      console.log(`[CartService] Checking existing cart_items for Claim ${claimId}`);
      const existing = await (this.prisma.cart_items as any).findFirst({
        where: { cart_id: cart.cart_id, giveaway_claim_id: claimId, deleted_at: null }
      });

      if (existing) {
        console.log(`[CartService] Prize already in cart`);
        throw new BadRequestException("Phần thưởng này đã có trong giỏ hàng của bạn.");
      }

      console.log(`[CartService] Creating new cart item for Claim ${claimId}`);
      await this.prisma.$transaction(async (tx) => {
        await (tx.cart_items as any).create({
          data: {
            cart_id: cart.cart_id,
            variant_id: claim.variant_id,
            quantity: 1,
            giveaway_claim_id: claimId,
            payment_option: 'FULL_PAYMENT',
            livestream_id: claim.livestream_id
          }
        });

        // 3. Mark claim as CLAIMED so it disappears from UI
        await tx.giveaway_claims.update({
          where: { claim_id: claimId },
          data: { status_code: 'CLAIMED' }
        });
      });

      console.log(`[CartService] Claim ${claimId} successfully added to cart`);
      return cart;
    } catch (error) {
      console.error(`[CartService] Error in addGiveawayToCart:`, error);
      throw error;
    } finally {
      console.log(`[CartService] Exiting addGiveawayToCart`);
    }
  }

  async getCart(userId: number) {
    const cart = await this.prisma.carts.findFirst({
      where: { user_id: userId, deleted_at: null },
      include: {
        cart_items: {
          where: { deleted_at: null },
          orderBy: { created_at: 'desc' },
          include: {
            livestreams: { select: { status: true } },
            product_variants: {
              include: {
                product_preorder_configs: true, // Included for correct price calculation
                product_promotions: {
                  include: {
                    promotion_items: true // Included for Flash Sale pricing
                  }
                },
                products: {
                  include: { product_blindboxes: true }
                }
              }
            }
          }
        }
      }
    });

    if (!cart) return { items: [], total: 0 };

    // Format for frontend
    const items = await Promise.all(cart.cart_items.map(async (item) => {
      const variant = item.product_variants as any; // Cast to any to access dynamic fields if needed
      const product = variant.products;

      const isPreorder = product.type_code === 'PREORDER';
      const isDeposit = (item as any).payment_option === 'DEPOSIT';

      // Logic: If Preorder & Deposit Mode -> Price is Deposit Amount. Else Full Price.
      let effectivePrice = Number(variant.price);
      let appliedFlashSale = false;

      if (isPreorder) {
        // Priority: Variant Preorder Config > Variant fields
        const preDef = variant.product_preorder_configs;

        const variantDeposit = Number(preDef?.deposit_amount || variant.deposit_amount || 0);
        const variantFull = Number(preDef?.full_price || variant.full_price || variant.price);

        // Fallback to variant price if no specific pre-order config found (shouldn't happen for valid pre-orders)
        const finalDeposit = variantDeposit;
        const finalFull = variantFull > 0 ? variantFull : Number(variant.price);

        if (isDeposit) {
          effectivePrice = finalDeposit;
        } else {
          effectivePrice = finalFull;
        }
      } else if (product.type_code === 'BLINDBOX') {
        const bb = (product as any).product_blindboxes;
        if (bb) {
          effectivePrice = Number(bb.price || 0);
        }
      } else {
        // LIVESTREAM PRICING LOGIC
        if (item.livestream_id) {
          // 1. Fetch Flash Sale if active
          const liveProduct = await this.prisma.livestream_products.findUnique({
            where: {
              livestream_id_variant_id: {
                livestream_id: item.livestream_id,
                variant_id: variant.variant_id
              }
            },
            include: {
              livestream: true // Fetch status
            }
          });

          // Also we can just rely on item.livestreams.status if we included it!
          const isLive = (item as any).livestreams?.status === 'LIVE';

          if (isLive && liveProduct && liveProduct.flash_sale_price && (liveProduct.flash_sale_stock || 0) > 0) {
            effectivePrice = Number(liveProduct.flash_sale_price);
          } else if (isLive) {
            // 2. Apply General 2% Live Discount
            effectivePrice = effectivePrice * 0.98;
          }
          // If NOT LIVE, it falls through to standard pricing (original price)
        } else {
          // RETAIL: Apply variant-level promotion / Flash Sale
          const promo = variant.product_promotions;
          if (this.isActivePromo(promo)) {
            if (promo.is_flash_sale) {
              const fsItem = promo.promotion_items?.find((i: any) => i.variant_id === variant.variant_id);
              if (fsItem) {
                effectivePrice = Number(fsItem.flash_sale_price);
              }
            } else {
              if (promo.type_code === 'PERCENTAGE') {
                effectivePrice = effectivePrice * (1 - Number(promo.value) / 100);
              } else if (promo.type_code === 'FIXED_AMOUNT') {
                effectivePrice = Math.max(0, effectivePrice - Number(promo.value));
              }
            }
          }
        }

        // --- FINAL OVERRIDE: GIVEAWAY IS ALWAYS 0 ---
        if ((item as any).giveaway_claim_id) {
          effectivePrice = 0;
        }
      }

      return {
        id: item.item_id, // Global Cart Item ID
        productId: product.product_id,
        variantId: variant.variant_id,
        name: `${product.name} (${variant.sku})`,
        price: effectivePrice,
        originalPrice: Number(variant.price),
        quantity: item.quantity,
        image: getFirstImage(product.media_urls),

        // METADATA
        type_code: product.type_code,
        payment_option: (item as any).payment_option,
        sku: variant.sku,
        maxStock: variant.stock_available,
        promotion: variant.product_promotions,
        livestream_id: item.livestream_id,
        is_live: (item as any).livestreams?.status === 'LIVE',
        giveaway_claim_id: (item as any).giveaway_claim_id
      };
    }));

    const total = items.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);

    return {
      cartId: cart.cart_id,
      items,
      total
    };
  }

  // Optimize: Should send item_id or variant_id? 
  // Let's support item_id for precision, or variant_id for ease?
  // Frontend mostly tracks local ID. Let's assume we pass VariantId for removal to match frontend logic easier?
  // Or ItemId. Let's use VariantId to align with addToCart dto structure typically.
  // Actually, standard is ItemId (CartItemId).
  async removeFromCart(userId: number, itemId: number) {
    // Verify ownership
    const cart = await this.getCartByUserId(userId);
    if (!cart) return;

    // --- CRITICAL GIVEAWAY PROTECTION ---
    const item = await this.prisma.cart_items.findUnique({
      where: { item_id: itemId }
    });
    
    if (item && (item as any).giveaway_claim_id) {
       throw new BadRequestException("Không thể xóa sản phẩm quà tặng trúng thưởng khỏi giỏ hàng. Bạn hãy tiến hành thanh toán để nhận quà!");
    }

    await this.prisma.cart_items.deleteMany({
      where: {
        item_id: itemId,
        cart_id: cart.cart_id
      }
    });

    return this.getCart(userId);
  }

  async updateQuantity(userId: number, itemId: number, quantity: number) {
    const cart = await this.getCartByUserId(userId);
    if (!cart) throw new NotFoundException('Cart not found');

    if (quantity <= 0) {
      return this.removeFromCart(userId, itemId);
    }

    // Check stock before update
    const item = await this.prisma.cart_items.findUnique({
      where: { item_id: itemId },
      include: {
        product_variants: {
          include: {
            products: true,
            product_promotions: {
              include: { promotion_items: true }
            }
          }
        }
      }
    });

    if (!item || item.cart_id !== cart.cart_id) throw new NotFoundException('Item not found');

    // --- CRITICAL GIVEAWAY PROTECTION ---
    if ((item as any).giveaway_claim_id) {
      throw new BadRequestException("Số lượng sản phẩm quà tặng là cố định (1). Bạn không thể thay đổi số lượng này.");
    }

    const isBlindbox = item.product_variants.products.type_code === 'BLINDBOX';

    if (isBlindbox) {
      const bbConfig = await this.prisma.product_blindboxes.findFirst({
        where: { product_id: item.product_variants.product_id }
      });

      if (bbConfig) {
        const aggregation = await this.prisma.product_variants.aggregate({
          _sum: { stock_available: true, stock_defect: true },
          where: {
            products: { type_code: 'RETAIL', status_code: 'ACTIVE' },
            price: { gte: Number(bbConfig.min_value), lte: Number(bbConfig.max_value) },
            deleted_at: null
          }
        });
        const dynamicStock = (aggregation._sum.stock_available || 0) + (aggregation._sum.stock_defect || 0);

        if (quantity > dynamicStock) {
          throw new BadRequestException(`Rất tiếc, chỉ còn ${dynamicStock} sản phẩm trong kho báu.`);
        }
      }
    } else if (item.product_variants.stock_available < quantity) {
      throw new BadRequestException(`Insufficient stock. Max: ${item.product_variants.stock_available}`);
    }

    // LIVESTREAM FLASH SALE Check (Livestream Module)
    if (item.livestream_id) {
      const liveConfig = await this.prisma.livestream_products.findUnique({
        where: { livestream_id_variant_id: { livestream_id: Number(item.livestream_id), variant_id: item.variant_id } }
      });
      if (liveConfig && liveConfig.flash_sale_price && Number(liveConfig.flash_sale_price) > 0) {
        const fsStock = liveConfig.flash_sale_stock || 0;
        if (quantity > fsStock) {
          throw new BadRequestException(`Suất Flash Sale hiện tại chỉ còn ${fsStock} sản phẩm. Bạn không thể tăng thêm lên ${quantity} suất.`);
        }
      }
    }

    await this.prisma.cart_items.update({
      where: { item_id: itemId },
      data: { quantity, updated_at: new Date() }
    });

    return this.getCart(userId);
  }

  async clearCart(userId: number) {
    const cart = await this.getCartByUserId(userId);
    if (cart) {
      await this.prisma.cart_items.deleteMany({
        where: { cart_id: cart.cart_id }
      });
    }
    return { message: 'Cart cleared' };
  }

  private async getCartByUserId(userId: number) {
    return this.prisma.carts.findFirst({ where: { user_id: userId, deleted_at: null } });
  }

  findAll() {
    return `This action returns all cart`;
  }
}

function getFirstImage(mediaUrls: any): string {
  if (!mediaUrls) return '';
  if (typeof mediaUrls === 'string') {
    try {
      const parsed = JSON.parse(mediaUrls);
      return Array.isArray(parsed) ? parsed[0] : '';
    } catch { return ''; }
  }
  if (Array.isArray(mediaUrls)) return mediaUrls[0];
  return '';
}
