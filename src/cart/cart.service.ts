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
      include: { products: true }
    });

    if (!variant) throw new NotFoundException('Variant not found');
    if (variant.product_id !== productId) throw new BadRequestException('Mismatch between Product and Variant');

    // Check stock (Optimization: Could check against existing cart quantity too?)
    if (variant.stock_available < quantity) {
      throw new BadRequestException(`Insufficient stock. Available: ${variant.stock_available}`);
    }

    // 2. Get User Cart
    const cart = await this.getOrCreateCart(userId);

    // 3. Upsert Item
    const existingItem = await this.prisma.cart_items.findFirst({
      where: { cart_id: cart.cart_id, variant_id: variantId, deleted_at: null }
    });

    if (existingItem) {
      const newQuantity = (existingItem.quantity || 1) + quantity;
      if (variant.stock_available < newQuantity) {
        throw new BadRequestException(`Cannot add ${quantity} more. Max available: ${variant.stock_available}, In Cart: ${existingItem.quantity}`);
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
                products: {
                  include: { product_preorders: true, product_blindboxes: true }
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
      const variant = item.product_variants;
      const product = variant.products;

      let price = Number(variant.price);

      if (product.type_code === 'PREORDER') {
        const po = (product as any).product_preorders;
        if (po) {
          price = Number(po.deposit_amount || 0);
        }
      } else if (product.type_code === 'BLINDBOX') {
        const bb = (product as any).product_blindboxes;
        if (bb) {
          price = Number(bb.price || 0);
        }
      }

      return {
        id: item.item_id, // Global Cart Item ID
        productId: product.product_id,
        variantId: variant.variant_id,
        name: `${product.name} (${variant.sku})`,
        price: price,
        quantity: item.quantity,
        image: getFirstImage(product.media_urls),
        type_code: product.type_code,
        sku: variant.sku,
        maxStock: variant.stock_available
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
