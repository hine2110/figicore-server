import { Injectable, BadRequestException, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from '../customers/customers.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { GhnService } from '../address/ghn.service';
import { MailService } from '../mail/mail.service';
import { EventsGateway } from '../events/events.gateway';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  constructor(
    private prisma: PrismaService,
    private ghnService: GhnService,
    private customersService: CustomersService,
    private mailService: MailService,
    private eventsGateway: EventsGateway,
    private walletService: WalletService
  ) { }

  // NEW: Anti-scalping Helper
  private async validateAntiScalping(tx: any, userId: number, variantId: number, quantity: number, limit: number) {
    // Count how many this user has already bought (active orders only)
    const pastOrders = await tx.order_items.findMany({
      where: {
        variant_id: variantId,
        orders: {
          user_id: userId,
          status_code: { notIn: ['CANCELLED', 'EXPIRED'] }
        }
      },
      select: { quantity: true }
    });

    const currentOwned = pastOrders.reduce((sum, item) => sum + item.quantity, 0);

    if (currentOwned + quantity > limit) {
      throw new BadRequestException(`Anti-scalping limit reached. You can only buy ${limit} units of this item.`);
    }
  }

  async create(userId: number, createOrderDto: CreateOrderDto) {
    const {
      shipping_address_id,
      items,
      shipping_fee,
      payment_method_code,
      voucherCode // Extract voucher code
    } = createOrderDto;

    // 1. Calculate Deadlines
    const retailDeadline = new Date();
    retailDeadline.setMinutes(retailDeadline.getMinutes() + 15); // 15 mins for Retail

    const preOrderDeadline = new Date();
    preOrderDeadline.setMinutes(preOrderDeadline.getMinutes() + 15); // Update: 15 mins for DEPOSIT too (Prevent Hoarding)

    try {
      const address = await this.prisma.addresses.findUnique({
        where: { address_id: shipping_address_id }
      });
      if (!address) throw new BadRequestException("Address not found");

      // Check Voucher Validity for Shipping (Simple Check)
      let appliedVoucherCode: string | null = null;
      let isVoucherFreeShip = false;
      if (voucherCode) {
        const promo = await this.prisma.promotions.findUnique({
          where: { code: voucherCode }
        });
        // Basic validity check (Date, Active, etc.) - Simplified for this task
        if (promo && (!promo.end_date || promo.end_date > new Date())) {
          appliedVoucherCode = voucherCode;
          // Assuming we have a way to know if it's a FreeShip voucher. 
          // For now, let's assume ALL validated vouchers passed here allow FreeShipping benefit reservation if applied on Deposit.
          // Or strictly: if (promo.discount_type === 'SHIPPING')
          isVoucherFreeShip = true;
        }
      }

      // 1.5 Generate Payment Ref Code
      const paymentRefCode = `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // 2. Start Transaction
      const createdOrders = await this.prisma.$transaction(async (tx) => {

        // A. Separation Phase
        const retailItems: any[] = [];
        const preOrderItems: any[] = [];

        // Pre-fetch variants to classify
        for (const item of items) {
          const variant = await tx.product_variants.findUnique({
            where: { variant_id: item.variant_id },
            include: {
              products: true,
              product_preorder_configs: true
            }
          });

          if (!variant) throw new BadRequestException(`Variant ${item.variant_id} not found`);

          const enrichedItem = { ...item, variant };

          // Use existence of definition or explicit product type
          const isPreorder = variant.products.type_code === 'PREORDER' || !!variant.product_preorder_configs;

          if (isPreorder) {
            preOrderItems.push(enrichedItem);
          } else {
            retailItems.push(enrichedItem);
          }
        }

        const ordersResults: any[] = [];

        // B. Process Pre-orders (Contracts & Deposit Orders -> ONE ORDER PER ITEM)
        if (preOrderItems.length > 0) {

          for (const pItem of preOrderItems) {
            const { variant, quantity, paymentOption } = pItem;
            // paymentOption: 'DEPOSIT' (Default) or 'FULL_PAYMENT'

            // 1. Anti-Scalping Check
            await this.validateAntiScalping(tx, userId, variant.variant_id, quantity, variant.product_preorder_configs?.max_qty_per_user || 2);

            // 2. Atomic Update (Concurrency Control)
            const result = await tx.$executeRaw`
                UPDATE "product_preorder_configs"
                SET "sold_slots" = "sold_slots" + ${quantity}
                WHERE "variant_id" = ${variant.variant_id}
                AND ("sold_slots" + ${quantity}) <= "total_slots"
            `;

            if (Number(result) === 0) {
              throw new BadRequestException(`Pre-order sold out for item: ${variant.sku}`);
            }

            // 3. Determine Financials & Incentives
            let isFullPayment = paymentOption === 'FULL_PAYMENT';

            // Amounts
            // Use product_preorder_configs for full_price and deposit_amount
            const fullPrice = Number(variant.product_preorder_configs?.full_price || variant.price);
            const depositConfig = Number(variant.product_preorder_configs?.deposit_amount || 0);

            let chargeAmountPerUnit = 0;
            let depositPerUnit = 0;
            let remainingPerUnit = 0;
            let isShippingFree = false;
            let shippingNote = '';

            if (isFullPayment) {
              chargeAmountPerUnit = fullPrice;
              depositPerUnit = fullPrice;
              remainingPerUnit = 0;
              isShippingFree = true;
              shippingNote = 'Full Payment Promotion';
            } else {
              chargeAmountPerUnit = depositConfig > 0 ? depositConfig : fullPrice;
              depositPerUnit = chargeAmountPerUnit;
              remainingPerUnit = fullPrice - depositPerUnit;
              isFullPayment = false;

              if (isVoucherFreeShip) {
                isShippingFree = true;
                shippingNote = `Voucher ${appliedVoucherCode} applied at deposit`;
              }
            }

            const poTotalDepositToPay = chargeAmountPerUnit * quantity;



            // 4. Create Separate Order for this Pre-order Item
            const poOrderCode = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            // Note: Prefix 'ORD' for Order Table to avoid confusion, contract gets 'PO' prefix as requested.

            // Prepare Order Item
            const poOrderItemsData = [{
              variant_id: variant.variant_id,
              quantity: quantity,
              unit_price: chargeAmountPerUnit, // Charging the Deposit (or Full) amount now
              total_price: chargeAmountPerUnit * quantity,
            }];

            const poOrder = await tx.orders.create({
              data: {
                user_id: userId,
                order_code: poOrderCode,
                shipping_address_id,
                total_amount: poTotalDepositToPay,
                shipping_fee: 0, // Deposit phase = 0 shipping
                original_shipping_fee: 0,
                payment_method_code,
                payment_ref_code: paymentRefCode, // LINK TO GROUP
                status_code: 'WAITING_DEPOSIT',
                payment_deadline: preOrderDeadline,
                channel_code: 'WEB',
                order_items: {
                  create: poOrderItemsData.map(i => ({
                    variant_id: i.variant_id,
                    quantity: i.quantity,
                    unit_price: i.unit_price,
                    total_price: i.total_price
                  }))
                },
                order_status_history: {
                  create: { new_status: 'WAITING_DEPOSIT', note: 'Pre-order Deposit Created' }
                }
              }
            });

            // 5. Create Contract Linked to Order
            // contract_code (now order_code in schema) -> "PO-{OrderId}-{VariantId}"
            const contractCode = `PO-${poOrder.order_id}-${variant.variant_id}`;
            await tx.preorder_contracts.create({
              data: {
                order_code: contractCode,
                user_id: userId,
                // product_id removed from schema
                variant_id: variant.variant_id,
                quantity: quantity,

                deposit_amount_paid: depositPerUnit * quantity,
                remaining_amount: remainingPerUnit * quantity,

                deposit_order_id: poOrder.order_id, // DIRECT LINK

                status_code: 'WAITING_DEPOSIT', // Initial status
              }
            });

            ordersResults.push(poOrder);
          }
        }

        // C. Process Retail Items (Standard Stock) - ONE BUNDLED ORDER
        if (retailItems.length > 0) {
          let rtTotalAmount = 0;
          let rtTotalWeight = 0;
          const rtOrderItemsData: any[] = [];

          for (const rItem of retailItems) {
            const { variant, quantity, price } = rItem;

            if (variant.stock_available < quantity) {
              throw new BadRequestException(`Out of stock: ${variant.sku}`);
            }

            // Deduct Stock
            await tx.product_variants.update({
              where: { variant_id: variant.variant_id },
              data: { stock_available: { decrement: quantity } }
            });

            rtTotalAmount += Number(price) * quantity;
            rtTotalWeight += (variant.weight_g || 200) * quantity;

            rtOrderItemsData.push({
              variant_id: variant.variant_id,
              quantity: quantity,
              unit_price: price,
              total_price: Number(price) * quantity
            });
          }

          // Calc Shipping for Retail
          let rtShippingFee = 0;
          let rtNominalShipping = 0;

          // Calculate default nominal shipping (Fallback)
          for (const rItem of retailItems) {
            const nominal = Number(rItem.variant.nominal_shipping_fee || 30000);
            rtNominalShipping += nominal * rItem.quantity;
          }

          try {
            if (address.district_id && address.ward_code) {
              rtShippingFee = await this.ghnService.calculateRealFee({
                to_district_id: address.district_id,
                to_ward_code: address.ward_code,
                weight: rtTotalWeight,
                insurance_value: rtTotalAmount
              });
            } else {
              rtShippingFee = rtNominalShipping; // Fallback only for internal accounting
            }
          } catch (e) {
            console.warn("GHN Shipping Calc Failed, using nominal fallback:", e.message);
            rtShippingFee = rtNominalShipping;
          }

          // FIX: FLAT RATE SHIPPING POLICY
          const FIXED_SHIPPING_FEE = 30000;
          const customerShippingFee = FIXED_SHIPPING_FEE;

          // Total now uses the fixed user fee, not the real cost
          const rtFinalTotal = rtTotalAmount + Number(customerShippingFee);

          const rtOrderCode = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const rtOrder = await tx.orders.create({
            data: {
              user_id: userId,
              order_code: rtOrderCode,
              shipping_address_id,
              total_amount: rtFinalTotal,
              shipping_fee: customerShippingFee, // Charge fixed 30k to user
              original_shipping_fee: rtShippingFee, // Store real cost for accounting
              payment_method_code,
              payment_ref_code: paymentRefCode, // LINK TO GROUP
              status_code: 'PENDING_PAYMENT',
              payment_deadline: retailDeadline,
              channel_code: 'WEB',
              order_items: { create: rtOrderItemsData },
              order_status_history: { create: { new_status: 'PENDING_PAYMENT', note: 'Retail Order Created' } }
            } as any
          });
          ordersResults.push(rtOrder);
        }

        // D. Clear Cart (Common)
        const cart = await tx.carts.findFirst({ where: { user_id: userId, deleted_at: null } });
        if (cart) {
          const allVariantIds = items.map(i => i.variant_id);
          await tx.cart_items.deleteMany({
            where: { cart_id: cart.cart_id, variant_id: { in: allVariantIds } }
          });
        }

        return ordersResults;
      });

      // Calculate Total Amount
      const totalAmount = createdOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);
      const orderIds = createdOrders.map(o => o.order_id);

      return {
        payment_ref_code: paymentRefCode,
        total_amount: totalAmount,
        order_ids: orderIds,
        orders: createdOrders // Optional: return objects if needed
      };

    } catch (error) {
      console.error("CREATE ORDER ERROR:", error);
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException('Failed to create order(s)');
    }
  }

  // --- NEW: FETCH ORDERS BY GROUP REF ---
  async getOrdersByRef(refCode: string, userId: number) {
    if (!refCode) throw new BadRequestException("Ref code required");

    const orders = await this.prisma.orders.findMany({
      where: {
        payment_ref_code: refCode,
        user_id: userId
      },
      include: {
        order_items: {
          include: {
            product_variants: {
              include: { products: true, product_preorder_configs: true }
            }
          }
        },
        addresses: true
      }
    });
    return orders;
  }

  // --- NEW: MOCK PAYMENT FOR GROUP ---
  async mockPayGroup(paymentRefCode: string, userId: number) {
    if (!paymentRefCode) throw new BadRequestException("Payment Ref Code required");

    const orders = await this.prisma.orders.findMany({
      where: { payment_ref_code: paymentRefCode, user_id: userId }
    });

    if (orders.length === 0) throw new NotFoundException("No orders found for this payment ref");

    // Verify all are pending
    const validStatuses = ['PENDING_PAYMENT', 'WAITING_DEPOSIT'];
    const invalid = orders.find(o => !validStatuses.includes(o.status_code || ''));
    if (invalid) {
      throw new BadRequestException("Some orders in this group are already processed or cancelled.");
    }

    await this.prisma.$transaction(async (tx) => {
      for (const order of orders) {
        const newStatus = order.status_code === 'PENDING_PAYMENT' ? 'PROCESSING' : 'DEPOSITED';

        // Update Order
        await tx.orders.update({
          where: { order_id: order.order_id },
          data: {
            status_code: newStatus,
            paid_amount: order.total_amount, // Paid in full (or deposit full)
            payment_method_code: 'MOCK_PAY'
          }
        });

        // If Pre-order, update pending contract/payment entry if needed?
        // Status 'WAITING_DEPOSIT' -> 'DEPOSITED' is managed via Order Status for now?
        // Ideally update Contract status too.
        if (newStatus === 'DEPOSITED') {
          // New Schema: Direct Link
          const contract = await tx.preorder_contracts.findFirst({
            where: { deposit_order_id: order.order_id }
          });

          if (contract) {
            await tx.preorder_contracts.update({
              where: { contract_id: contract.contract_id },
              data: { status_code: 'DEPOSITED', deposit_amount_paid: order.total_amount }
            });
          }
        }
      }
    });

    return { success: true, message: `Payment successful for group ${paymentRefCode}` };
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
        addresses: true,
        // NEW: Include the contract linked to this deposit order
        contract_deposit: {
          select: {
            contract_id: true,
            status_code: true,
            remaining_amount: true
          }
        }
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
                products: true, // To get name, image
                product_preorder_configs: true // NEW: Needed for Price Calculation in Order Detail
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

  // --- NEW: FETCH MY CONTRACTS ---
  async findMyContracts(userId: number) {
    return this.prisma.preorder_contracts.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      include: {
        product_variants: {
          include: {
            products: true,
            product_preorder_configs: true
          }
        },
        // CRITICAL: Include deposit_order AND its address for Auto-fill capability
        deposit_order: {
          include: {
            addresses: true
          }
        },
        final_order: true
      }
    });
  }

  // --- NEW: PHASE 3 - FINAL PAYMENT LOGIC (SINGLE ORDER LIFECYCLE) ---
  async createFinalPaymentOrder(userId: number, contractId: number, data: { shipping_address_id: number, payment_method_code: string }) {
    const { shipping_address_id, payment_method_code } = data;

    return this.prisma.$transaction(async (tx) => {
      // 1. Fetch Contract & Verify Status
      const contract = await tx.preorder_contracts.findFirst({
        where: { contract_id: contractId, user_id: userId },
        include: {
          product_variants: {
            include: {
              products: true,
              product_preorder_configs: true
            }
          }
        }
      });

      if (!contract) throw new NotFoundException(`Contract #${contractId} not found`);

      if (contract.status_code !== 'READY_FOR_PAYMENT') {
        throw new BadRequestException(`Contract is not ready for final payment (Status: ${contract.status_code})`);
      }

      // 2. Validate Original Order Existed
      if (!contract.deposit_order_id) {
        throw new BadRequestException("Corrupt contract: No deposit order linked.");
      }

      // 3. Calculate Amounts
      // Single Source of Truth for Price: Config
      const config = contract.product_variants.product_preorder_configs;
      if (!config) throw new BadRequestException("Pre-order config missing for variant");

      const fullPrice = Number(config.full_price);
      const shippingFee = 30000; // Fixed Shipping
      const totalAmount = (fullPrice * contract.quantity) + shippingFee;

      let newStatus = 'PROCESSING'; // Default to Ready to Ship (COD)
      let additionalPaid = 0;

      // WALLET PAYMENT LOGIC
      if (payment_method_code === 'WALLET') {
        // Calculate what is owed
        // We know 'deposit_amount_paid' is what they paid.
        // Total - DepositPaid = Remaining to Deduct.
        const depositPaid = Number(contract.deposit_amount_paid);
        const amountToDeduct = totalAmount - depositPaid; // Should equal remaining + shipping

        await this.walletService.deductBalance(userId, amountToDeduct, `ORD-${contract.deposit_order_id}`, `Final Payment for Contract #${contractId}`);

        newStatus = 'PROCESSING';
        additionalPaid = amountToDeduct;
      } else if (payment_method_code === 'BANKING') {
        // If Banking, maybe PENDING_PAYMENT? But user requested PROCESSING for mock simplicity or manual verify. 
        // Sticking to 'PROCESSING' as requested for "Mock/Final" simplicity in this task.
        // Realistically might be 'PENDING_FINAL_PAYMENT' if async.
        newStatus = 'PROCESSING';
      }

      // 4. MUTATE the Original Order (Single ID Strategy)
      const updatedOrder = await tx.orders.update({
        where: { order_id: contract.deposit_order_id },
        data: {
          status_code: newStatus,
          // Update total to full price + shipping
          total_amount: totalAmount,
          shipping_fee: shippingFee,

          shipping_address_id,
          payment_method_code,

          // If Wallet, we increase paid_amount. If COD, we keep it as Deposit (so Due = Total - Paid)
          paid_amount: { increment: additionalPaid },

          updated_at: new Date(),

          order_status_history: {
            create: { new_status: newStatus, note: 'Pre-order Final Payment Completed (Single ID)' }
          }
        }
      });

      // 5. Link & Update Contract to logic Closed
      await tx.preorder_contracts.update({
        where: { contract_id: contractId },
        data: {
          final_payment_order_id: contract.deposit_order_id, // Self-reference
          status_code: 'COMPLETED',
          updated_at: new Date()
        }
      });

      return updatedOrder;
    });
  }

  async getContractDetails(contractId: number, userId: number) {
    const contract = await this.prisma.preorder_contracts.findFirst({
      where: { contract_id: contractId, user_id: userId },
      include: {
        product_variants: {
          include: {
            products: true,
            product_preorder_configs: true
          }
        },
        deposit_order: {
          include: {
            addresses: true
          }
        } // Deposit Order
      }
    });

    if (!contract) throw new NotFoundException(`Contract #${contractId} not found`);
    return contract;
  }

  async cancelOrder(orderId: number, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.orders.findFirst({
        where: { order_id: orderId, user_id: userId },
        include: {
          order_items: {
            include: {
              product_variants: {
                include: {
                  products: true,
                  product_preorder_configs: true // NEW: Needed for revert logic
                }
              }
            }
          }
        }
      });

      if (!order) throw new BadRequestException("Order not found");

      // If already cancelled, just return
      if (order.status_code === 'CANCELLED') return order;

      // Allow PENDING (Retail) and WAITING_DEPOSIT (Pre-order)
      if (!['PENDING_PAYMENT', 'WAITING_DEPOSIT'].includes(order.status_code || '')) {
        throw new BadRequestException("Cannot cancel processed orders");
      }

      // 1. Revert Stock (Handle Retail vs Pre-order)
      for (const item of order.order_items) {
        const variant = item.product_variants;
        const isPreorder = variant.products.type_code === 'PREORDER' || !!variant.product_preorder_configs;

        if (isPreorder) {
          // Revert Pre-order Slot on CONFIG table
          await tx.product_preorder_configs.update({
            where: { variant_id: item.variant_id },
            data: { sold_slots: { decrement: item.quantity } }
          });
        } else {
          // Revert Retail Stock
          await tx.product_variants.update({
            where: { variant_id: item.variant_id },
            data: { stock_available: { increment: item.quantity } }
          });
        }
      }

      // 2. Restore Items to Cart
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

      // 3. Update Order Status
      const cancelledOrder = await tx.orders.update({
        where: { order_id: orderId },
        data: { status_code: 'CANCELLED' }
      });

      // FIX: Synchronize Contract Status
      // We simply look for contracts linked to this order and mark them as CANCELLED.
      // NOTE: Do NOT add logic to release slots here, as the existing flow already handles it successfully.
      await tx.preorder_contracts.updateMany({
        where: {
          deposit_order_id: orderId, // Find contract linked to this deposit order
        },
        data: {
          status_code: 'CANCELLED',
          // Optional: Add a note or updated_at if needed
          updated_at: new Date()
        }
      });

      return cancelledOrder;
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
