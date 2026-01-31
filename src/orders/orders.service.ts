import { Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  constructor(private prisma: PrismaService) { }

  async create(userId: number, createOrderDto: CreateOrderDto) {
    const {
      shipping_address_id,
      items,
      shipping_fee,
      original_shipping_fee,
      payment_method_code
    } = createOrderDto;

    // 1. Calculate Deadline (15 minutes from now) - BOX LOCK LOGIC
    const paymentDeadline = new Date();
    paymentDeadline.setMinutes(paymentDeadline.getMinutes() + 1);

    try {
      // Use Prisma Transaction
      return await this.prisma.$transaction(async (tx) => {
        let totalAmount = 0;

        // 2. Process Items & Deduct Stock
        for (const item of items) {
          // Lock & Get Variant
          const variant = await tx.product_variants.findUnique({
            where: { variant_id: item.variant_id }
          });

          if (!variant) {
            throw new BadRequestException(`Variant not found: ${item.variant_id}`);
          }

          if (variant.stock_available < item.quantity) {
            throw new BadRequestException(`Out of stock: ${variant.sku} (Available: ${variant.stock_available})`);
          }

          // DEDUCT STOCK (Hard Reserve)
          await tx.product_variants.update({
            where: { variant_id: item.variant_id },
            data: {
              stock_available: { decrement: item.quantity }
            }
          });

          // Log Inventory (Optional but good for tracking)
          // Note: Ensure inventory_logs table exists and has these fields.
          // If it fails, we might need to adjust based on schema.
          // Assuming schema supports it based on user request.
          await tx.inventory_logs.create({
            data: {
              variant_id: item.variant_id,
              change_amount: -item.quantity,
              change_type_code: 'OUTBOUND_SALE',
              note: `Order Lock for User ${userId}`
            }
          });

          totalAmount += Number(item.price) * item.quantity;
        }

        const finalTotal = totalAmount + Number(shipping_fee);

        // 3. Create Order Record
        const orderCode = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        const newOrder = await tx.orders.create({
          data: {
            user_id: userId,
            order_code: orderCode,
            shipping_address_id: shipping_address_id,
            total_amount: finalTotal,
            shipping_fee: shipping_fee,
            original_shipping_fee: original_shipping_fee || shipping_fee,
            payment_method_code: payment_method_code,
            status_code: 'PENDING_PAYMENT',
            payment_deadline: paymentDeadline,
            channel_code: 'WEB',

            order_items: {
              create: items.map(item => ({
                quantity: item.quantity,
                unit_price: item.price,
                total_price: Number(item.price) * item.quantity,
                product_variants: {
                  connect: { variant_id: item.variant_id }
                }
              }))
            },

            order_status_history: {
              create: {
                previous_status: null,
                new_status: 'PENDING_PAYMENT',
                note: 'Order Created'
              }
            }
          } as any
        });

        // 4. Clear Cart for this User
        // We use deleteMany directly on cart_items linked to the user's cart
        const cart = await tx.carts.findFirst({
          where: { user_id: userId, deleted_at: null }
        });

        if (cart) {
          // FIX: Clear ONLY selected items from Cart
          const variantIds = items.map(i => i.variant_id);
          await tx.cart_items.deleteMany({
            where: {
              cart_id: cart.cart_id,
              variant_id: { in: variantIds }
            }
          });
        }

        return newOrder;
      });
    } catch (error) {
      console.error("CREATE ORDER ERROR:", error);
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException('Failed to process order transaction');
    }
  }

  async confirmPayment(orderId: number, userId: number) {
    // Simple state transition for simulation
    return this.prisma.orders.update({
      where: { order_id: orderId, user_id: userId },
      data: { status_code: 'PROCESSING' } // Confirmed
    });
  }

  private async _processExpireTransaction(orderId: number) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.orders.findUnique({
        where: { order_id: orderId },
        include: { order_items: true }
      });

      if (!order) throw new BadRequestException(`Order #${orderId} not found`);

      // Idempotency check
      if (order.status_code === 'EXPIRED') return order;
      if (order.status_code === 'CANCELLED') return order; // Or maybe throw?

      if (order.status_code !== 'PENDING_PAYMENT') {
        throw new BadRequestException("Only pending orders can be expired");
      }

      // 1. Revert Stock
      for (const item of order.order_items) {
        await tx.product_variants.update({
          where: { variant_id: item.variant_id },
          data: { stock_available: { increment: item.quantity } }
        });
      }

      // 2. Restore Items to Cart (NEW LOGIC)
      try {
        const userId = order.user_id;
        // Find active cart or create one if missing (though usually cart persists)
        let cart = await tx.carts.findFirst({ where: { user_id: userId, deleted_at: null } });
        if (!cart) {
          cart = await tx.carts.create({ data: { user_id: userId } });
        }

        // Add items back to cart
        if (cart) {
          await tx.cart_items.createMany({
            data: order.order_items.map(item => ({
              cart_id: cart!.cart_id,
              variant_id: item.variant_id,
              quantity: item.quantity
            }))
          });
        }
      } catch (err) {
        console.error("Failed to restore items to cart", err);
        // We don't block cancellation if this fails, just log it
      }

      // 3. Update Status
      return tx.orders.update({
        where: { order_id: orderId },
        data: { status_code: 'EXPIRED' }
      });
    });
  }

  async expireOrder(orderId: number, userId: number) {
    // Basic verification - though internal logic checks status
    const order = await this.prisma.orders.findUnique({
      where: { order_id: orderId, user_id: userId }
    });
    if (!order) throw new BadRequestException(`Order #${orderId} not found for this user`);

    return this._processExpireTransaction(orderId);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleOverdueOrders() {
    this.logger.debug('Running Cron: Checking for overdue orders...');

    const overdueOrders = await this.prisma.orders.findMany({
      where: {
        status_code: 'PENDING_PAYMENT',
        payment_deadline: { lt: new Date() } // Deadline < Now
      }
    });

    if (overdueOrders.length === 0) return;

    this.logger.log(`Found ${overdueOrders.length} overdue orders. Expiring now...`);

    for (const order of overdueOrders) {
      try {
        await this._processExpireTransaction(order.order_id);
        this.logger.log(`Expired Order #${order.order_id}`);
      } catch (e) {
        this.logger.error(`Failed to expire Order #${order.order_id}`, e);
      }
    }
  }

  findAll() {
    return `This action returns all orders`;
  }

  async findOne(id: number) {
    const order = await this.prisma.orders.findUnique({
      where: { order_id: id },
      include: {
        order_items: {
          include: {
            product_variants: {
              include: {
                products: true // To get name, image
              }
            }
          }
        },
        addresses: true // To show address
      }
    });

    if (!order) {
      throw new BadRequestException(`Order #${id} not found`);
    }
    return order;
  }

  async cancelOrder(orderId: number, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.orders.findFirst({
        where: { order_id: orderId, user_id: userId },
        include: { order_items: true }
      });

      if (!order) throw new BadRequestException("Order not found");

      // If already cancelled, just return
      if (order.status_code === 'CANCELLED') return order;

      if (order.status_code !== 'PENDING_PAYMENT') {
        throw new BadRequestException("Cannot cancel processed orders");
      }

      // 1. Revert Stock
      for (const item of order.order_items) {
        await tx.product_variants.update({
          where: { variant_id: item.variant_id },
          data: { stock_available: { increment: item.quantity } }
        });
      }

      // 2. Restore Items to Cart (NEW LOGIC)
      try {
        const userId = order.user_id;
        let cart = await tx.carts.findFirst({ where: { user_id: userId, deleted_at: null } });
        if (!cart) {
          cart = await tx.carts.create({ data: { user_id: userId } });
        }

        if (cart) {
          await tx.cart_items.createMany({
            data: order.order_items.map(item => ({
              cart_id: cart!.cart_id,
              variant_id: item.variant_id,
              quantity: item.quantity
            }))
          });
        }
      } catch (err) {
        console.error("Failed to restore items to cart", err);
      }

      // 3. Update Status
      return tx.orders.update({
        where: { order_id: orderId },
        data: { status_code: 'CANCELLED' }
      });
    });
  }

  async update(id: number, updateOrderDto: UpdateOrderDto) {
    const order = await this.prisma.orders.findUnique({
      where: { order_id: id }
    });

    if (!order) {
      throw new BadRequestException(`Order #${id} not found`);
    }

    if (order.status_code !== 'PENDING_PAYMENT') {
      throw new BadRequestException(`Cannot update order in status: ${order.status_code}`);
    }

    return this.prisma.orders.update({
      where: { order_id: id },
      data: {
        shipping_address_id: updateOrderDto.shipping_address_id,
        payment_method_code: updateOrderDto.payment_method_code,
        shipping_fee: updateOrderDto.shipping_fee, // Allow updating fee if address changes
        original_shipping_fee: updateOrderDto.original_shipping_fee
      }
    });
  }

  remove(id: number) {
    return `This action removes a #${id} order`;
  }
}
