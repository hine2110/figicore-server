import { Injectable, BadRequestException, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from '../customers/customers.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { GhnService } from '../address/ghn.service';
import { MailService } from '../mail/mail.service';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  constructor(
    private prisma: PrismaService,
    private ghnService: GhnService,
    private customersService: CustomersService,
    private mailService: MailService,
    private eventsGateway: EventsGateway
  ) { }

  async create(userId: number, createOrderDto: CreateOrderDto) {
    const {
      shipping_address_id,
      items,
      shipping_fee,
      payment_method_code
    } = createOrderDto;

    // 1. Calculate Deadline (15 minutes from now)
    const paymentDeadline = new Date();
    paymentDeadline.setMinutes(paymentDeadline.getMinutes() + 1);

    try {
      // Fetch Address + Items info OUTSIDE transaction for fee calculation
      // (Or inside, but GHN call is external, better to prep args first or do inside if read-dependant)
      // Since we need to look up variants for weight, we can do it inside the loop or beforehand.
      // Let's do it efficiently.

      const address = await this.prisma.addresses.findUnique({
        where: { address_id: shipping_address_id }
      });
      if (!address) throw new BadRequestException("Address not found");

      // Transaction
      const newOrder = await this.prisma.$transaction(async (tx) => {
        let totalAmount = 0;
        let totalWeight = 0;

        // 2. Process Items & Deduct Stock & Calc Weight
        for (const item of items) {
          const variant = await tx.product_variants.findUnique({
            where: { variant_id: item.variant_id }
          });

          if (!variant) throw new BadRequestException(`Variant not found: ${item.variant_id}`);
          if (variant.stock_available < item.quantity) {
            throw new BadRequestException(`Out of stock: ${variant.sku}`);
          }

          // Deduct Stock
          await tx.product_variants.update({
            where: { variant_id: item.variant_id },
            data: { stock_available: { decrement: item.quantity } }
          });

          // Calc Totals
          totalAmount += Number(item.price) * item.quantity;
          totalWeight += (variant.weight_g || 200) * item.quantity; // Default 200g
        }

        // 3. Calculate Real Shipping Fee via GHN
        let realShippingFee = 0;
        try {
          // If district/ward is missing, fallback or throw. Assuming address has valid IDs from checks.
          // Note: address.district_id is number, ward_code is string.
          if (address.district_id && address.ward_code) {
            realShippingFee = await this.ghnService.calculateRealFee({
              to_district_id: address.district_id,
              to_ward_code: address.ward_code,
              weight: totalWeight,
              insurance_value: totalAmount
            });
          }
        } catch (feeError) {
          console.error("Fee Calc Error, using default", feeError);
          realShippingFee = 50000; // Fallback
        }

        const finalTotal = totalAmount + Number(shipping_fee);

        // 4. Create Order
        const orderCode = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        const newOrder = await tx.orders.create({
          data: {
            user_id: userId,
            order_code: orderCode,
            shipping_address_id: shipping_address_id,
            total_amount: finalTotal,
            shipping_fee: shipping_fee, // Customer pays this
            original_shipping_fee: realShippingFee, // Real cost
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

        // 5. Clear Cart
        const cart = await tx.carts.findFirst({
          where: { user_id: userId, deleted_at: null }
        });

        if (cart) {
          const variantIds = items.map(i => i.variant_id);
          await tx.cart_items.deleteMany({
            where: {
              cart_id: cart.cart_id,
              variant_id: { in: variantIds }
            }
          });
        }

        return newOrder;
      }); // End Transaction

      // Emit Real-time Notification to Warehouse
      // Emit Real-time Notification to Warehouse
      // this.eventsGateway.notifyNewOrder(newOrder);

      return newOrder;
    } catch (error) {
      console.error("CREATE ORDER ERROR:", error);
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException('Failed to process order transaction');
    }
  }

  async confirmPayment(orderId: number, userId: number) {
    // 1. Run Transaction (Update Status)
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.orders.findUnique({
        where: { order_id: orderId, user_id: userId },
      });

      if (!order) throw new BadRequestException(`Order #${orderId} not found`);

      await tx.orders.update({
        where: { order_id: orderId },
        data: { status_code: 'PROCESSING', paid_amount: order.total_amount }
      });
    });

    // 2. Fetch Full Order for Email
    const fullOrder = await this.prisma.orders.findUnique({
      where: { order_id: orderId },
      include: {
        users: true, // Relation: users? (Optional)
        order_items: {
          include: { product_variants: { include: { products: true } } }
        }
      }
    });

    // FIX: Guard Clause - If order or user is missing, skip email safely
    if (!fullOrder || !fullOrder.users) {
      console.warn(`[ConfirmPayment] Skip email. Order or User not found for ID: ${orderId}`);
      return { success: true, message: 'Payment confirmed (No email sent)' };
    }

    // Now TypeScript knows 'fullOrder' and 'fullOrder.users' are NOT null
    this.mailService.sendOrderConfirmation(fullOrder.users, fullOrder);
    // FIX: Trigger Realtime Notification for Warehouse HERE (Processing/Paid only)
    this.eventsGateway.notifyNewOrder(fullOrder);

    return { success: true, message: 'Payment confirmed' };
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

  async findAll(params?: { status?: string }) {
    const { status } = params || {};
    return this.prisma.orders.findMany({
      where: status ? { status_code: status } : {},
      orderBy: { created_at: 'asc' }, // FIFO: Oldest First
      include: {
        order_items: {
          include: {
            product_variants: {
              include: { products: true }
            }
          }
        },
        addresses: true,
      }
    });
  }

  async findAllByUser(userId: number) {
    return this.prisma.orders.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      include: {
        order_items: {
          include: {
            product_variants: {
              include: {
                products: true
              }
            }
          }
        },
        addresses: true
      }
    });
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
        addresses: true, // To show address
        shipments: true // To show tracking info
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

  // --- WEBHOOK HELPERS ---

  async updateStatusByTrackingCode(trackingCode: string, status: string) {
    // Map string status to Enum or DB value if needed, or pass directly
    const order = await this.prisma.orders.findFirst({
      where: {
        shipments: {
          tracking_code: trackingCode
        }
      },
      include: { users: true, shipments: true }
    });

    if (!order) {
      console.warn(`Order with tracking/order code ${trackingCode} not found`);
      return null;
    }

    // Trigger Shipping Email
    if (status === 'SHIPPING' && order.users) {
      // Run async
      this.mailService.sendShippingUpdate(order.users, order);
    }

    return this.prisma.orders.update({
      where: { order_id: order.order_id },
      data: { status_code: status }
    });
  }

  async completeOrder(trackingCode: string, realShippingFee?: number) {
    const order = await this.prisma.orders.findFirst({
      where: {
        shipments: {
          tracking_code: trackingCode
        }
      },
      include: {
        users: {
          include: { customers: true }
        }
      }
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.status_code === 'COMPLETED') return; // Idempotency check

    // A. Update Order Status & Financials
    await this.prisma.orders.update({
      where: { order_id: order.order_id },
      data: {
        status_code: 'COMPLETED',
        // payment_status: 'PAID', // Removed: Invalid field. COD paid means paid_amount = total
        paid_amount: order.total_amount,
        // delivered_at: new Date(), // Removed: Field does not exist in schema
        // Sync the REAL fee from GHN if provided
        original_shipping_fee: realShippingFee ? realShippingFee : undefined
      }
    });

    // B. Trigger Loyalty Points
    if (this.customersService && order.user_id) {
      await this.customersService.addPoints(order.user_id, Number(order.total_amount));
    }

    // C. Trigger Delivery Success Email
    if (order.users) {
      this.mailService.sendDeliverySuccess(order.users, order, Number(order.total_amount));
    }

    return { success: true, message: `Order ${trackingCode} completed and points added.` };
  }
}
