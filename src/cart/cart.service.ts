import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { CreateCartDto } from './dto/create-cart.dto';
import { UpdateCartDto } from './dto/update-cart.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) { }

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
        product_preorder_configs: true // NEW: Fetch configs
      }
    });

    if (!variant) throw new NotFoundException('Variant not found');
    if (variant.product_id !== productId) throw new BadRequestException('Mismatch between Product and Variant');

    // BRANCHED VALIDATION: Pre-order vs Retail
    if (variant.products.type_code === 'PREORDER' || variant.product_preorder_configs) {
      // Pre-order Validation: Check Slots
      const def = variant.product_preorder_configs;
      if (!def) {
        // If type PREORDER but no definition, assume unlimited or handled elsewhere? 
        // For now, strict:
        throw new BadRequestException('Pre-order configuration missing');
      }

      const currentSold = def.sold_slots || 0;
      const limit = def.total_slots || 0;

      if (currentSold + quantity > limit) {
        throw new BadRequestException(`Pre-order slots full. Remaining: ${Math.max(0, limit - currentSold)}`);
      }
    } else {
      // Retail Validation: Check Physical Stock
      if (variant.stock_available < quantity) {
        throw new BadRequestException(`Insufficient stock. Available: ${variant.stock_available}`);
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
    const existingItem = await this.prisma.cart_items.findFirst({
      where: { cart_id: cart.cart_id, variant_id: variantId, deleted_at: null }
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
      } else {
        if (variant.stock_available < newQuantity) {
          throw new BadRequestException(`Cannot add ${quantity} more. Max available: ${variant.stock_available}, In Cart: ${existingItem.quantity}`);
        }
      }

      await this.prisma.cart_items.update({
        where: { item_id: existingItem.item_id },
        data: { quantity: newQuantity, updated_at: new Date() }
      });
    } else {
      await this.prisma.cart_items.create({
        data: {
          cart_id: cart.cart_id,
          variant_id: variantId,
          quantity: quantity,
          payment_option: dto.paymentOption || 'DEPOSIT' // Ensure DTO has this or we default
        }
      });
    }

    return this.getCart(userId);
  }

  async getCart(userId: number) {
    const cart = await this.prisma.carts.findFirst({
      where: { user_id: userId, deleted_at: null },
      include: {
        cart_items: {
          where: { deleted_at: null },
          orderBy: { created_at: 'desc' },
          include: {
            product_variants: {
              include: {
                product_preorder_configs: true, // Included for correct price calculation
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
    const items = cart.cart_items.map(item => {
      const variant = item.product_variants as any; // Cast to any to access dynamic fields if needed
      const product = variant.products;

      const isPreorder = product.type_code === 'PREORDER';
      const isDeposit = (item as any).payment_option === 'DEPOSIT';

      // Logic: If Preorder & Deposit Mode -> Price is Deposit Amount. Else Full Price.
      let effectivePrice = Number(variant.price);

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

        // PRICING FIELDS (Critical for Frontend)
        deposit_amount: Number(variant.product_preorder_configs?.deposit_amount || 0),
        full_price: Number(variant.product_preorder_configs?.full_price || variant.price),
        max_qty_per_user: Number(variant.product_preorder_configs?.max_qty_per_user || 0)
      };
    });

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
      include: { product_variants: true }
    });

    if (!item || item.cart_id !== cart.cart_id) throw new NotFoundException('Item not found');

    if (item.product_variants.stock_available < quantity) {
      throw new BadRequestException(`Insufficient stock. Max: ${item.product_variants.stock_available}`);
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
