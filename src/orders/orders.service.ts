import { Injectable, BadRequestException, InternalServerErrorException, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from '../customers/customers.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { GhnService } from '../address/ghn.service';
import { MailService } from '../mail/mail.service';
import { EventsGateway } from '../events/events.gateway';
import { WalletService } from '../wallet/wallet.service';
import { BlindboxesService } from '../blindboxes/blindboxes.service';
import { AuctionsService } from '../auctions/auctions.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  constructor(
    private prisma: PrismaService,
    private ghnService: GhnService,
    private customersService: CustomersService,
    private mailService: MailService,
    private eventsGateway: EventsGateway,
    private walletService: WalletService,
    private blindboxesService: BlindboxesService,
    @Inject(forwardRef(() => AuctionsService)) private auctionsService: AuctionsService
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
      payment_method_code,
      discountVoucherCode,
      freeShipVoucherCode
    } = createOrderDto as any;

    const retailDeadline = new Date();
    retailDeadline.setMinutes(retailDeadline.getMinutes() + 15);
    const preOrderDeadline = new Date();
    preOrderDeadline.setMinutes(preOrderDeadline.getMinutes() + 15);

    try {
      const address = await this.prisma.addresses.findUnique({
        where: { address_id: shipping_address_id }
      });
      if (!address) throw new BadRequestException("Address not found");

      // 1. Backend Authoritative Pricing & Flash Sale Evaluation
      let cartTotalAmountDiscounted = 0;
      const validatedItems: any[] = [];
      const now = new Date();
      const currentHHmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      for (const item of items) {
        const variant = await this.prisma.product_variants.findUnique({
          where: { variant_id: item.variant_id },
          include: {
            products: true,
            product_preorder_configs: true,
            product_promotions: true
          }
        });
        if (!variant) throw new BadRequestException(`Variant ${item.variant_id} not found`);

        let finalUnitPrice = Number(variant.price);
        
        // Flash Sale (Product Promotion) Real-time Check
        const promo = variant.product_promotions;
        let appliedFlashSale = false;
        
        if (promo && promo.is_active) {
          let isValidPromo = true;

          // --- FIX: Unified time-window check for BOTH recurring and non-recurring ---
          // Build full DateTime objects by merging date + HH:mm time string.
          // This prevents the bug where a non-recurring Flash Sale was accessible
          // from 00:00 of start_date instead of the configured start_time.

          // Determine the reference date: use start_date if set, else use today's date.
          const startDateBase = promo.start_date ? new Date(promo.start_date) : now;
          const endDateBase   = promo.end_date   ? new Date(promo.end_date)   : now;

          // Parse start_time / end_time ("HH:mm") and merge with respective dates.
          const [startHH, startMM] = promo.start_time.split(':').map(Number);
          const [endHH,   endMM  ] = promo.end_time.split(':').map(Number);

          const promoStart = new Date(startDateBase);
          promoStart.setHours(startHH, startMM, 0, 0);

          const promoEnd = new Date(endDateBase);
          promoEnd.setHours(endHH, endMM, 59, 999);

          // For purely recurring promos (no fixed date), use today's date as base.
          if (promo.is_recurring && !promo.start_date && !promo.end_date) {
            promoStart.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
            promoEnd.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
          }

          if (now < promoStart || now > promoEnd) {
            isValidPromo = false;
          }

          if (isValidPromo) {
            if (promo.is_flash_sale) {
               // Load flash sale details
               const fsItem = await this.prisma.promotion_items.findFirst({
                 where: { promotion_id: promo.promotion_id, variant_id: item.variant_id }
               });
               if (fsItem) {
                 finalUnitPrice = Number(fsItem.flash_sale_price);
                 appliedFlashSale = true;
               }
            } else {
               if (promo.type_code === 'PERCENTAGE') {
                  finalUnitPrice = finalUnitPrice * (1 - Number(promo.value) / 100);
               } else if (promo.type_code === 'FIXED_AMOUNT') {
                  finalUnitPrice = Math.max(0, finalUnitPrice - Number(promo.value));
               }
            }
          }
        }

        const quantity = Number(item.quantity);
        cartTotalAmountDiscounted += finalUnitPrice * quantity;

        validatedItems.push({
          ...item,
          variant,
          _backendVerifiedPrice: finalUnitPrice, // Saved purely from DB + Valid Promos
          _applied_flash_sale: appliedFlashSale
        });
      }

      // 2. Validate & Compute Order Vouchers
      let usedDiscountPromotionId: number | null = null;
      let orderVoucherDiscountAmount = 0;

      if (discountVoucherCode) {
        const userDiscountVoucher = await this.prisma.user_vouchers.findFirst({
          where: {
            user_id: userId,
            is_used: false,
            promotions: { code: discountVoucherCode }
          },
          include: { promotions: true }
        });

        if (userDiscountVoucher && (!userDiscountVoucher.promotions.end_date || userDiscountVoucher.promotions.end_date > now)) {
          if (userDiscountVoucher.promotions.start_date && new Date(userDiscountVoucher.promotions.start_date) > now) {
            throw new BadRequestException("This discount voucher is not yet active.");
          }
          if (userDiscountVoucher.promotions.min_order_value && cartTotalAmountDiscounted < Number(userDiscountVoucher.promotions.min_order_value)) {
            throw new BadRequestException("Order total does not meet the minimum required for this voucher.");
          }
          usedDiscountPromotionId = userDiscountVoucher.promotion_id;

          const discountType = userDiscountVoucher.promotions.discount_type;
          const discountValue = Number(userDiscountVoucher.promotions.discount_value);

          // Calculate actual discount money
          if (discountType === 'PERCENTAGE') {
            orderVoucherDiscountAmount = cartTotalAmountDiscounted * (discountValue / 100);
          } else if (discountType === 'FIXED_AMOUNT') {
            orderVoucherDiscountAmount = discountValue;
          }
        } else {
          throw new BadRequestException("Discount voucher is invalid, expired, or has not been collected.");
        }
      }

      // 3. Free Shipping Voucher
      let usedFreeShipPromotionId: number | null = null;
      let isVoucherFreeShip = false;

      if (freeShipVoucherCode) {
        const userFreeShipVoucher = await this.prisma.user_vouchers.findFirst({
          where: {
            user_id: userId,
            is_used: false,
            promotions: { code: freeShipVoucherCode, discount_type: 'FREE_SHIP' }
          },
          include: { promotions: true }
        });

        if (userFreeShipVoucher && (!userFreeShipVoucher.promotions.end_date || userFreeShipVoucher.promotions.end_date > now)) {
          if (userFreeShipVoucher.promotions.min_order_value && cartTotalAmountDiscounted < Number(userFreeShipVoucher.promotions.min_order_value)) {
            throw new BadRequestException("Order total does not meet minimum required for free shipping.");
          }
          usedFreeShipPromotionId = userFreeShipVoucher.promotion_id;
          isVoucherFreeShip = true;
        } else {
          throw new BadRequestException("Free shipping voucher invalid or expired.");
        }
      }

      const paymentRefCode = `PAY${Date.now()}${Math.floor(Math.random() * 1000)}`;

      // 4. BIG TRANSACTION: Separation & Creation
      const createdOrders = await this.prisma.$transaction(async (tx) => {
        const retailItems: any[] = [];
        const preOrderItems: any[] = [];
        const blindboxItems: any[] = [];

        for (const vItem of validatedItems) {
          const { variant } = vItem;
          const isPreorder = variant.products.type_code === 'PREORDER' || !!variant.product_preorder_configs;
          const isBlindbox = variant.products.type_code === 'BLINDBOX';

          if (isPreorder) preOrderItems.push(vItem);
          else if (isBlindbox) blindboxItems.push(vItem);
          else retailItems.push(vItem);
        }

        const ordersResults: any[] = [];

        // --- A. BLINDBOX PROCESSING ---
        if (blindboxItems.length > 0) {
          for (const bItem of blindboxItems) {
            const bbConfig = await tx.product_blindboxes.findUnique({
              where: { product_id: bItem.variant.product_id }
            });
            if (!bbConfig) throw new BadRequestException("Blindbox config missing");

            const wonVariants = await this.blindboxesService.pickUniqueItems(tx, bbConfig, bItem.quantity);
            const ticketVariant = await tx.product_variants.findFirst({
              where: { product_id: bItem.variant.product_id, option_name: 'Blindbox Ticket' }
            }) || bItem.variant;

            for (const won of wonVariants) {
              retailItems.push({
                ...bItem,
                variant: ticketVariant,
                quantity: 1,
                _allocated_product_id: won.variant_id,
                _is_opened: false,
                _metadata: { source: (won as any)._source_stock || 'AVAILABLE' }
              });
            }
          }
        }

        // --- B. PRE-ORDERS PROCESSING ---
        if (preOrderItems.length > 0) {
          for (const pItem of preOrderItems) {
            const { variant, quantity } = pItem;
            await this.validateAntiScalping(tx, userId, variant.variant_id, quantity, variant.product_preorder_configs?.max_qty_per_user || 2);

            const result = await tx.$executeRaw`
                UPDATE "product_preorder_configs"
                SET "sold_slots" = "sold_slots" + ${quantity}
                WHERE "variant_id" = ${variant.variant_id}
                AND ("sold_slots" + ${quantity}) <= "total_slots"
            `;

            if (Number(result) === 0) throw new BadRequestException(`Pre-order sold out for item: ${variant.sku}`);

            const requestedOption = pItem.payment_option || pItem.paymentOption;
            let isFullPayment = requestedOption === 'FULL_PAYMENT';

            const fullPrice = Number(variant.product_preorder_configs?.full_price || variant.price);
            const depositConfig = Number(variant.product_preorder_configs?.deposit_amount || 0);

            let chargeAmountPerUnit = 0;
            let depositPerUnit = 0;
            let remainingPerUnit = 0;

            if (isFullPayment) {
              chargeAmountPerUnit = fullPrice;
              depositPerUnit = fullPrice;
            } else {
              chargeAmountPerUnit = depositConfig > 0 ? depositConfig : fullPrice;
              depositPerUnit = chargeAmountPerUnit;
              remainingPerUnit = fullPrice - depositPerUnit;
            }

            const poTotalDepositToPay = chargeAmountPerUnit * quantity;
            const poOrderCode = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

            const poOrder = await tx.orders.create({
              data: {
                user_id: userId,
                order_code: poOrderCode,
                shipping_address_id,
                total_amount: poTotalDepositToPay,
                shipping_fee: 0,
                original_shipping_fee: 0,
                payment_method_code,
                payment_ref_code: paymentRefCode,
                status_code: 'WAITING_DEPOSIT',
                payment_deadline: preOrderDeadline,
                channel_code: 'WEB',
                order_items: {
                  create: [{
                    variant_id: variant.variant_id,
                    quantity: quantity,
                    unit_price: chargeAmountPerUnit,
                    total_price: chargeAmountPerUnit * quantity
                  }]
                },
                order_status_history: {
                  create: { new_status: 'WAITING_DEPOSIT', note: 'Pre-order Deposit Created' }
                }
              }
            });

            const contractCode = `PO-${poOrder.order_id}-${variant.variant_id}`;
            await tx.preorder_contracts.create({
              data: {
                order_code: contractCode,
                user_id: userId,
                variant_id: variant.variant_id,
                quantity: quantity,
                deposit_amount_paid: depositPerUnit * quantity,
                remaining_amount: remainingPerUnit * quantity,
                deposit_order_id: poOrder.order_id,
                status_code: 'WAITING_DEPOSIT',
              }
            });

            ordersResults.push(poOrder);
          }
        }

        // --- C. RETAIL PROCESSING (AUTHORITATIVE CHECKOUT) ---
        if (retailItems.length > 0) {
          let rtTotalAmountVerified = 0;
          let rtTotalWeight = 0;
          const rtOrderItemsData: any[] = [];

          for (const rItem of retailItems) {
            const { variant, quantity, _backendVerifiedPrice, _allocated_product_id, _is_opened, _metadata, _applied_flash_sale } = rItem;

            if (variant.stock_available < quantity) {
              throw new BadRequestException(`Out of stock: ${variant.sku}`);
            }

            // --- KIỂM TRA CHỐT CHẶN QUOTA FLASH SALE ---
            if (_applied_flash_sale && variant.product_promotions) {
              const promoId = variant.product_promotions.promotion_id;
              
              const currentPromoItem = await tx.promotion_items.findFirst({
                 where: { promotion_id: promoId, variant_id: variant.variant_id }
              });

              if (currentPromoItem) {
                const remainingQuota = currentPromoItem.quota - currentPromoItem.sold;
                
                if (quantity > remainingQuota) {
                  throw new BadRequestException('Sản phẩm Flash Sale này chỉ còn lại ' + remainingQuota + ' suất. Vui lòng giảm số lượng.');
                }

                // Cập nhật Sold Realtime (Atomic Update OCC)
                const updateRes = await tx.promotion_items.updateMany({
                  where: {
                    item_id: currentPromoItem.item_id,
                    sold: { lte: currentPromoItem.quota - quantity }
                  },
                  data: {
                    sold: { increment: quantity }
                  }
                });

                if (updateRes.count === 0) {
                  throw new BadRequestException('Sản phẩm Flash Sale này vừa hết hàng do có người khác thanh toán trước. Vui lòng thử lại.');
                }
              }
            }

            await tx.product_variants.update({
              where: { variant_id: variant.variant_id },
              data: { stock_available: { decrement: quantity } }
            });

            // MATH: Verified Base Price 
            rtTotalAmountVerified += _backendVerifiedPrice * quantity;
            rtTotalWeight += (variant.weight_g || 200) * quantity;

            rtOrderItemsData.push({
              variant_id: variant.variant_id,
              quantity: quantity,
              unit_price: _backendVerifiedPrice,
              total_price: _backendVerifiedPrice * quantity,
              allocated_product_id: _allocated_product_id || null, // Keep Blindbox allocation
              is_opened: _is_opened ?? false,
              metadata: _metadata || undefined
            });
          }

          let customerShippingFee = 30000;
          if (isVoucherFreeShip) {
            customerShippingFee = 0;
          }

          // CHỐT CHẶN: VOUCHER DISCOUNT LOGIC (Ngăn âm đơn hàng)
          const finalTotalBeforeShipping = Math.max(0, rtTotalAmountVerified - orderVoucherDiscountAmount);
          const rtFinalTotal = finalTotalBeforeShipping + customerShippingFee;

          const rtOrderCode = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const rtOrder = await tx.orders.create({
            data: {
              user_id: userId,
              order_code: rtOrderCode,
              shipping_address_id,
              total_amount: rtFinalTotal,           // <--- BUG FIXED: Saved fully discounted total
              discount_amount: orderVoucherDiscountAmount, // <--- SAVED: Record the applied discount
              shipping_fee: customerShippingFee,
              original_shipping_fee: 30000,
              payment_method_code,
              payment_ref_code: paymentRefCode,
              status_code: 'PENDING_PAYMENT',
              payment_deadline: retailDeadline,
              channel_code: 'WEB',
              promotion_id: usedDiscountPromotionId,
              shipping_promotion_id: usedFreeShipPromotionId,
              order_items: { create: rtOrderItemsData },
              order_status_history: { create: { new_status: 'PENDING_PAYMENT', note: 'Retail Order Created (Authoritative Pricing)' } }
            } as any
          });
          ordersResults.push(rtOrder);
        }

        // --- D. CLEANUP: Clear Cart & Consume Vouchers ---
        const cart = await tx.carts.findFirst({ where: { user_id: userId, deleted_at: null } });
        if (cart) {
          const allVariantIds = items.map((i: any) => i.variant_id);
          await tx.cart_items.deleteMany({
            where: { cart_id: cart.cart_id, variant_id: { in: allVariantIds } }
          });
        }

        if (usedDiscountPromotionId) {
          await tx.user_vouchers.updateMany({
            where: { user_id: userId, promotion_id: usedDiscountPromotionId, is_used: false },
            data: { is_used: true }
          });
        }
        if (usedFreeShipPromotionId) {
          await tx.user_vouchers.updateMany({
            where: { user_id: userId, promotion_id: usedFreeShipPromotionId, is_used: false },
            data: { is_used: true }
          });
        }

        return ordersResults;
      });

      const totalAmount = createdOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);
      const orderIds = createdOrders.map(o => o.order_id);

      return {
        payment_ref_code: paymentRefCode,
        total_amount: totalAmount,
        order_ids: orderIds,
        orders: createdOrders
      };

    } catch (error) {
      this.logger.error("CREATE ORDER ERROR:", error);
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(error.message || 'Failed to create order(s)');
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

  // --- NEW: FETCH SINGLE ORDER BY CODE (or code prefix for auction orders) ---
  async getOrderByCode(code: string, userId: number) {
    if (!code) throw new BadRequestException('Order code required');

    // For auction orders, code may be a prefix (e.g., "AUC-12") matching "AUC-12-1234567890"
    const orders = await this.prisma.orders.findMany({
      where: {
        user_id: userId,
        order_code: { startsWith: code }
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
      },
      orderBy: { created_at: 'desc' }
    });

    if (!orders || orders.length === 0) {
      throw new NotFoundException(`No order found with code: ${code}`);
    }

    // Return array for compatibility with Checkout.tsx (legacyAuction path sets fetchedOrders = res.data)
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



    // --- FIX: SEND NOTIFICATIONS AFTER TRANSACTION ---
    try {
      // Re-fetch orders with relations to send emails & socket
      const updatedOrders = await this.prisma.orders.findMany({
        where: { payment_ref_code: paymentRefCode, user_id: userId },
        include: {
          users: true,
          order_items: { include: { product_variants: { include: { products: true } } } }
        }
      });

      // --- NEW: SYNC AUCTION STATUS ---
      for (const order of updatedOrders) {
        if (order.order_code && order.order_code.startsWith('AUC-')) {
          try {
            const auctionId = parseInt(order.order_code.split('-')[1], 10);
            await this.prisma.auctions.update({
              where: { auction_id: auctionId },
              data: { status_code: 'COMPLETED' }
            });
            this.logger.log(`Synced Auction #${auctionId} to COMPLETED after payment`);
          } catch (err) {
            this.logger.error(`Failed to sync auction status for order ${order.order_code}:`, err);
          }
        }
      }

      for (const order of updatedOrders) {
        if (order.users && order.users.email) {
          // Send Email
          this.mailService.sendOrderConfirmation(order.users, order).catch(e => console.error("Mail Error", e));
        }
        // Emit Socket
        this.eventsGateway.notifyNewOrder(order);
      }
      this.logger.log(`Notifications sent for group ${paymentRefCode}`);

    } catch (error) {
      console.error("Failed to send notifications for group payment", error);
    }

    return { success: true, message: `Payment successful for group ${paymentRefCode}` };
  }

  // --- NEW: WALLET PAYMENT FOR GROUP ---
  async payWithWallet(paymentRefCode: string, userId: number) {
    if (!paymentRefCode) throw new BadRequestException("Payment Ref Code required");

    try {
      await this.prisma.$transaction(async (tx) => {
        // 1. Fetch orders in the group that are pending payment
        const orders = await tx.orders.findMany({
          where: { payment_ref_code: paymentRefCode, user_id: userId, status_code: 'PENDING_PAYMENT' }
        });

        if (!orders.length) throw new BadRequestException("No pending orders found for this reference");

        // 2. Calculate Total Required
        const totalAmount = orders.reduce((sum, o) => sum + Number(o.total_amount), 0);

        // 3. Fetch Wallet & Verify Balance
        const wallet = await tx.wallets.findUnique({
          where: { user_id: userId }
        });

        if (!wallet) {
          throw new BadRequestException("Wallet not found. Please activate your FigiWallet.");
        }

        if (Number(wallet.balance_available) < totalAmount) {
          throw new BadRequestException("Insufficient wallet balance.");
        }

        // 4. Deduct Balance
        await tx.wallets.update({
          where: { wallet_id: wallet.wallet_id },
          data: { balance_available: { decrement: totalAmount } }
        });

        // 5. Update Orders to PROCESSING and Create Payment Transactions
        for (const order of orders) {
          await tx.orders.update({
            where: { order_id: order.order_id },
            data: { status_code: 'PROCESSING', paid_amount: order.total_amount }
          });
        }

        // 6. Record Wallet Deduction Transaction
        await tx.wallet_transactions.create({
          data: {
            wallet_id: wallet.wallet_id,
            type_code: 'PAYMENT',
            amount: -totalAmount,
            reference_code: paymentRefCode,
            description: `Payment for order group ${paymentRefCode}`
          }
        });
      });

      // 7. Post-Transaction Actions (Notifications, Socket)
      const updatedOrders = await this.prisma.orders.findMany({
        where: { payment_ref_code: paymentRefCode, user_id: userId },
        include: {
          users: true,
          order_items: { include: { product_variants: { include: { products: true } } } }
        }
      });

      // --- NEW: SYNC AUCTION STATUS ---
      for (const order of updatedOrders) {
        if (order.order_code && order.order_code.startsWith('AUC-')) {
          try {
            const auctionId = parseInt(order.order_code.split('-')[1], 10);
            await this.prisma.auctions.update({
              where: { auction_id: auctionId },
              data: { status_code: 'COMPLETED' }
            });
            this.logger.log(`Synced Auction #${auctionId} to COMPLETED after wallet payment`);
          } catch (err) {
            this.logger.error(`Failed to sync auction status for order ${order.order_code}:`, err);
          }
        }
      }

      for (const order of updatedOrders) {
        if (order.users && order.users.email) {
          this.mailService.sendOrderConfirmation(order.users, order).catch(e => console.error("Mail Error", e));
        }
        this.eventsGateway.notifyNewOrder(order);
      }
      this.logger.log(`Wallet Payment successful for group ${paymentRefCode}`);

    } catch (error) {
      this.logger.error("Wallet Payment Error:", error);
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException('Payment processing failed');
    }

    return { success: true, message: `Wallet payment successful for group ${paymentRefCode}` };
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
        include: {
          order_items: true
        }
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
        // --- CRITICAL FIX START ---
        // --- CRITICAL FIX START ---
        // 1. Restore Real Item / Retail Item
        const targetVariantId = item.allocated_product_id ?? item.variant_id;
        const metadata = (item.metadata as any) || {};

        if (metadata.source === 'DEFECT') {
          await tx.product_variants.update({
            where: { variant_id: targetVariantId },
            data: { stock_defect: { increment: item.quantity } }
          });
        } else {
          await tx.product_variants.update({
            where: { variant_id: targetVariantId },
            data: { stock_available: { increment: item.quantity } }
          });
        }

        // 2. Restore Blindbox Ticket (Virtual Stock)
        if (item.allocated_product_id) {
          await tx.product_variants.update({
            where: { variant_id: item.variant_id }, // The Ticket ID
            data: { stock_available: { increment: item.quantity } }
          });
        }

        // 3. Restore Flash Sale Quota (Decimal-safe)
        const promoItems = await tx.promotion_items.findMany({
          where: {
            variant_id: item.variant_id,
            sold: { gte: item.quantity }
          },
          orderBy: { item_id: 'desc' }
        });

        const promoItem = promoItems.find(p => Number(p.flash_sale_price) === Number(item.unit_price)) || promoItems[0];

        if (promoItem) {
          await tx.promotion_items.update({
            where: { item_id: promoItem.item_id },
            data: { sold: { decrement: item.quantity } }
          });
          this.logger.log(`[Expire] Restored ${item.quantity} quota to Flash Sale Item #${promoItem.item_id}`);
        }
        // --- CRITICAL FIX END ---
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

      // 2.5 Restore Vouchers (If any were applied)
      const usedPromotions = [order.promotion_id, order.shipping_promotion_id].filter(Boolean) as number[];
      if (order.user_id && usedPromotions.length > 0) {
        for (const promoId of usedPromotions) {
          // Find the user_voucher record and set is_used back to false
          const usedVoucher = await tx.user_vouchers.findFirst({
            where: {
              user_id: order.user_id,
              promotion_id: promoId,
              is_used: true
            },
            orderBy: {
              updated_at: 'desc' // Try to get the one most recently used
            }
          });

          if (usedVoucher) {
            await tx.user_vouchers.update({
              where: { id: usedVoucher.id },
              data: { is_used: false }
            });
          }
        }
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
            },
            allocated_variant: {
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

  // FIX: Allow Staff to see censored video if needed.
  // Updated signature to accept optional user context
  async findOne(id: number, user?: any) {
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

    // CHECK: Any unopened blindbox?
    const hasUnopened = order.order_items.some((i: any) =>
      i.product_variants.products.type_code === 'BLINDBOX' && !i.is_opened
    );

    // FIX: Only censor if the order is NOT completed (User hasn't received it yet)
    // AND User is NOT Staff/Admin
    const isStaff = user?.role === 'ADMIN' || user?.role?.startsWith('STAFF');

    if (hasUnopened && order.status_code !== 'COMPLETED' && !isStaff) {
      // CENSOR THE VIDEO
      order.packing_video_urls = null;

      // Marker for Frontend to show "Spoiler Protected" message
      (order as any).is_blindbox_protected = true;

      // CENSOR THE ITEMS
      order.order_items = order.order_items.map((item: any) => {
        if (item.product_variants.products.type_code === 'BLINDBOX' && !item.is_opened) {
          return {
            ...item,
            allocated_product_id: null, // Hide the real item ID
          };
        }
        return item;
      });
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

      let paymentRefCodeStr: string | undefined = undefined;

      // WALLET PAYMENT LOGIC
      if (payment_method_code === 'WALLET') {
        const depositPaid = Number(contract.deposit_amount_paid);
        const amountToDeduct = totalAmount - depositPaid;

        await this.walletService.deductBalance(userId, amountToDeduct, `ORD-${contract.deposit_order_id}`, `Final Payment for Contract #${contractId}`);

        newStatus = 'PROCESSING';
        additionalPaid = amountToDeduct;
      } else if (payment_method_code === 'BANKING') {
        newStatus = 'PENDING_FINAL_PAYMENT';
        paymentRefCodeStr = `PAY${Date.now()}${Math.floor(Math.random() * 1000)}`;
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
          payment_ref_code: paymentRefCodeStr !== undefined ? paymentRefCodeStr : undefined,

          updated_at: new Date(),

          order_status_history: {
            create: { new_status: newStatus, note: 'Pre-order Final Payment Completed (Single ID)' }
          }
        }
      });

      // 5. Link & Update Contract to logic Closed (Only if fully paid via Wallet)
      await tx.preorder_contracts.update({
        where: { contract_id: contractId },
        data: {
          final_payment_order_id: contract.deposit_order_id, // Self-reference
          status_code: newStatus === 'PROCESSING' ? 'COMPLETED' : 'READY_FOR_PAYMENT',
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
    const result = await this.prisma.$transaction(async (tx) => {
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

      // Special Handling for Auction Orders
      if (order.order_code && order.order_code.startsWith('AUC-')) {
        const parts = order.order_code.split('-');
        const auctionId = parseInt(parts[1], 10);

        const cancelledAuctionOrder = await tx.orders.update({
          where: { order_id: orderId },
          data: { status_code: 'CANCELLED' }
        });

        // Save auctionId to process forfeit outside transaction
        return { ...cancelledAuctionOrder, _auctionForfeitId: auctionId };
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
          // --- CRITICAL FIX START ---
          // Identify the real inventory item (Blindbox Content vs Retail Item)
          const targetVariantId = item.allocated_product_id ?? item.variant_id;

          // Check metadata to return to correct stock pile (Defect vs Available)
          const metadata = (item.metadata as any) || {};

          if (metadata.source === 'DEFECT') {
            await tx.product_variants.update({
              where: { variant_id: targetVariantId },
              data: { stock_defect: { increment: item.quantity } }
            });
          } else {
            // Default / Available / Safe Fallback
            await tx.product_variants.update({
              where: { variant_id: targetVariantId },
              data: { stock_available: { increment: item.quantity } }
            });
          }

          // FIX: Restore Blindbox Ticket as well
          if (item.allocated_product_id) {
            await tx.product_variants.update({
              where: { variant_id: item.variant_id },
              data: { stock_available: { increment: item.quantity } }
            });
          }

          // FIX: Restore Flash Sale Quota
          const promoItem = await tx.promotion_items.findFirst({
            where: {
              variant_id: item.variant_id,
              flash_sale_price: item.unit_price,
              sold: { gte: item.quantity }
            }
          });

          if (promoItem) {
            await tx.promotion_items.update({
              where: { item_id: promoItem.item_id },
              data: { sold: { decrement: item.quantity } }
            });
            this.logger.log(`[Cancel] Restored ${item.quantity} quota to Flash Sale Item #${promoItem.item_id}`);
          }
          // --- CRITICAL FIX END ---
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

      // 2.5 Restore Vouchers
      const usedPromotions = [order.promotion_id, order.shipping_promotion_id].filter(Boolean) as number[];
      if (order.user_id && usedPromotions.length > 0) {
        for (const promoId of usedPromotions) {
          const usedVoucher = await tx.user_vouchers.findFirst({
            where: {
              user_id: order.user_id,
              promotion_id: promoId,
              is_used: true
            },
            orderBy: {
              updated_at: 'desc'
            }
          });

          if (usedVoucher) {
            await tx.user_vouchers.update({
              where: { id: usedVoucher.id },
              data: { is_used: false }
            });
          }
        }
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

    // Execute side-effect outside the transaction
    if (result && (result as any)._auctionForfeitId) {
      await this.auctionsService.manualForfeitAuction((result as any)._auctionForfeitId, userId);
      delete (result as any)._auctionForfeitId;
    }

    return result;
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

    // Sync RETURNED to corresponding return_requests
    if (status === 'RETURNED') {
      await this.prisma.return_requests.updateMany({
        where: {
          order_id: order.order_id,
          status_code: 'SHIPPING_TO_WAREHOUSE'
        },
        data: {
          status_code: 'INSPECTING'
        }
      });
    }

    return this.prisma.orders.update({
      where: { order_id: order.order_id },
      data: { status_code: status }
    });
  }

  async simulateReturnByOrderCode(orderCode: string) {
    const order = await this.prisma.orders.findUnique({
      where: { order_code: orderCode },
      include: { shipments: true }
    });

    if (!order || !order.shipments) {
      throw new NotFoundException(`Cannot simulate return: Order ${orderCode} or its shipment not found`);
    }

    const trackingCode = order.shipments.tracking_code;

    if (!trackingCode) {
      throw new NotFoundException(`Tracking code not found for order ${orderCode}`);
    }

    // Simulate Pick Up
    await this.updateStatusByTrackingCode(trackingCode, 'RETURNING');

    // Simulate Delivery to Warehouse
    await this.updateStatusByTrackingCode(trackingCode, 'RETURNED');

    return { success: true, trackingCode };
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
    let earnedPoints = 0;
    if (this.customersService && order.user_id) {
      const statsResult = await this.customersService.updateCustomerStats(order.user_id, Number(order.total_amount));
      if (statsResult?.pointsAdded) {
        earnedPoints = statsResult.pointsAdded;
      }
    }

    // C. Trigger Delivery Success Email
    if (order.users) {
      this.mailService.sendDeliverySuccess(order.users, order, earnedPoints);
    }

    // D. Sync Auction Status if it is an auction order
    if (order.order_code && order.order_code.startsWith('AUC-')) {
      try {
        const auctionId = parseInt(order.order_code.split('-')[1], 10);
        await this.prisma.auctions.update({
          where: { auction_id: auctionId },
          data: { status_code: 'COMPLETED' }
        });
        this.logger.log(`Synced Auction #${auctionId} to COMPLETED after delivery/completion`);
      } catch (err) {
        this.logger.error(`Failed to sync auction status for order ${order.order_code}:`, err);
      }
    }

    return { success: true, message: `Order ${trackingCode} completed and points added.` };
  }
}
