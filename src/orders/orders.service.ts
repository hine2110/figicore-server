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
import { LivestreamLiveGateway } from '../livestreams/livestream-live.gateway';
import { EncryptionService } from '../common/encryption.service';

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
    @Inject(forwardRef(() => AuctionsService)) private auctionsService: AuctionsService,
    private livestreamLiveGateway: LivestreamLiveGateway,
    private encryption: EncryptionService,
  ) { }

  private decryptUser(user: any) {
    if (!user) return null;
    const decrypted = { ...user };
    if (decrypted.phone) decrypted.phone = this.encryption.decrypt(decrypted.phone);
    if (decrypted.email) decrypted.email = this.encryption.decrypt(decrypted.email);
    return decrypted;
  }

  private decryptAddress(addresses: any): any {
    if (!addresses) return addresses;
    if (Array.isArray(addresses)) {
      return addresses.map(a => this.decryptAddress(a));
    }
    const dec = { ...addresses };
    if (dec.detail_address) {
      try {
        dec.detail_address = this.encryption.decrypt(dec.detail_address);
      } catch (e) {
        // Fallback for plaintext
      }
    }
    if (dec.recipient_phone) {
      try {
        dec.recipient_phone = this.encryption.decrypt(dec.recipient_phone);
      } catch (e) {
        // Fallback for plaintext
      }
    }
    return dec;
  }

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
      const rawAddress = await this.prisma.addresses.findUnique({
        where: { address_id: shipping_address_id }
      });
      if (!rawAddress) throw new BadRequestException("Address not found");
      const address = this.decryptAddress(rawAddress);

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
          const endDateBase = promo.end_date ? new Date(promo.end_date) : now;

          // Parse start_time / end_time ("HH:mm") and merge with respective dates.
          const [startHH, startMM] = (promo.start_time || "00:00").split(':').map(Number);
          const [endHH, endMM] = (promo.end_time || "23:59").split(':').map(Number);

          const promoStart = new Date(startDateBase);
          promoStart.setHours(startHH, startMM, 0, 0);

          const promoEnd = new Date(endDateBase);
          promoEnd.setHours(endHH, endMM, 59, 999);

          // For purely recurring promos (no fixed date), use today's date as base.
          if (promo.is_recurring && !promo.start_date && !promo.end_date) {
            promoStart.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
            promoEnd.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
          }

          // EXPLICIT DATE BOUNDARY: Even if recurring, it must be within [start_date, end_date] if they exist.
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
                (item as any)._flash_sale_item_id = fsItem.item_id;
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

        let isLivestreamFlashSale = false;
        // ------ LIVESTREAM PRICING OVERRIDE ------
        if (item.livestreamId) {
          const liveProduct = await this.prisma.livestream_products.findUnique({
            where: {
              livestream_id_variant_id: {
                livestream_id: Number(item.livestreamId),
                variant_id: item.variant_id
              }
            },
            include: { livestream: true }
          });

          if (liveProduct?.livestream?.status === 'LIVE') {
            if (liveProduct.flash_sale_price && (liveProduct.flash_sale_stock || 0) > 0) {
              finalUnitPrice = Number(liveProduct.flash_sale_price);
              appliedFlashSale = true;
              isLivestreamFlashSale = true;
            } else {
              finalUnitPrice = finalUnitPrice * 0.98; // 2% Live Discount
            }
          }
        }
        // -----------------------------------------

        const quantity = Number(item.quantity);
        cartTotalAmountDiscounted += finalUnitPrice * quantity;

        validatedItems.push({
          ...item,
          variant,
          _backendVerifiedPrice: item.giveaway_claim_id ? 0 : finalUnitPrice, // 0 for prizes
          _applied_flash_sale: appliedFlashSale,
          _is_livestream_flash_sale: isLivestreamFlashSale,
          giveaway_claim_id: item.giveaway_claim_id,
          _flash_sale_item_id: (item as any)._flash_sale_item_id || null
        });
      }

      // 2. Validate & Compute Order Vouchers
      let usedDiscountPromotionId: number | null = null;
      let orderVoucherDiscountAmount = 0;

      // ── Retail-only voucher guard ──────────────────────────────────────────
      // Compute retail subtotal separately (excludes blindbox & preorder items)
      const retailSubtotal = validatedItems
        .filter(item => {
          const tc = item.variant?.products?.type_code;
          return tc !== 'BLINDBOX' && tc !== 'PREORDER' && !item.variant?.product_preorder_configs;
        })
        .reduce((sum, item) => sum + (item._backendVerifiedPrice ?? Number(item.variant.price)) * Number(item.quantity), 0);

      const hasOnlyNonRetailItems = retailSubtotal === 0 && validatedItems.length > 0;

      if (discountVoucherCode) {
        if (hasOnlyNonRetailItems) {
          throw new BadRequestException('Discount vouchers can only be applied to retail products. Blind Box and Pre-Order items are not eligible.');
        }

        const userDiscountVoucher = await this.prisma.user_vouchers.findFirst({
          where: {
            user_id: userId,
            status: 'COLLECTED',
            promotions: { code: discountVoucherCode }
          },
          include: { promotions: true }
        });

        if (userDiscountVoucher && (!userDiscountVoucher.promotions.end_date || userDiscountVoucher.promotions.end_date > now)) {
          if (userDiscountVoucher.promotions.start_date && new Date(userDiscountVoucher.promotions.start_date) > now) {
            throw new BadRequestException("This discount voucher is not yet active.");
          }
          // Validate min_order_value against RETAIL subtotal only
          if (userDiscountVoucher.promotions.min_order_value && retailSubtotal < Number(userDiscountVoucher.promotions.min_order_value)) {
            throw new BadRequestException("Order total (retail items only) does not meet the minimum required for this voucher.");
          }
          usedDiscountPromotionId = userDiscountVoucher.promotion_id;

          const discountType = userDiscountVoucher.promotions.discount_type;
          const discountValue = Number(userDiscountVoucher.promotions.discount_value);

          // Calculate actual discount money based on retail subtotal
          if (discountType === 'PERCENTAGE') {
            let calculated = retailSubtotal * (discountValue / 100);
            const maxCap = Number(userDiscountVoucher.promotions.max_discount_amount);
            if (maxCap > 0) {
              calculated = Math.min(calculated, maxCap);
            }
            orderVoucherDiscountAmount = calculated;
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
        if (hasOnlyNonRetailItems) {
          throw new BadRequestException('Free shipping vouchers can only be applied to retail products. Blind Box and Pre-Order items are not eligible.');
        }

        const userFreeShipVoucher = await this.prisma.user_vouchers.findFirst({
          where: {
            user_id: userId,
            status: 'COLLECTED',
            promotions: { code: freeShipVoucherCode, discount_type: 'FREE_SHIP' }
          },
          include: { promotions: true }
        });

        if (userFreeShipVoucher && (!userFreeShipVoucher.promotions.end_date || userFreeShipVoucher.promotions.end_date > now)) {
          if (userFreeShipVoucher.promotions.min_order_value && retailSubtotal < Number(userFreeShipVoucher.promotions.min_order_value)) {
            throw new BadRequestException("Order total (retail items only) does not meet minimum required for free shipping.");
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
        const blindboxItems: any[] = []; // NEW

        // Pre-fetch variants to classify
        for (const item of validatedItems) {
          const variant = await tx.product_variants.findUnique({
            where: { variant_id: item.variant_id },
            include: {
              products: true,
              product_preorder_configs: true
            }
          });

          if (!variant) throw new BadRequestException(`Variant ${item.variant_id} not found`);

          const enrichedItem = { ...item, variant, livestreamId: item.livestreamId, giveaway_claim_id: item.giveaway_claim_id };

          // Use existence of definition or explicit product type
          const isPreorder = variant.products.type_code === 'PREORDER' || !!variant.product_preorder_configs;
          const isBlindbox = variant.products.type_code === 'BLINDBOX';

          if (isPreorder) preOrderItems.push(enrichedItem);
          else if (isBlindbox) blindboxItems.push(enrichedItem);
          else retailItems.push(enrichedItem);
        }

        const ordersResults: any[] = [];

        // --- A. BLINDBOX PROCESSING ---
        if (blindboxItems.length > 0) {
          const bbGroups = new Map<number, any[]>();
          for (const bItem of blindboxItems) {
            const pId = bItem.variant.product_id;
            if (!bbGroups.has(pId)) bbGroups.set(pId, []);
            bbGroups.get(pId)!.push(bItem);
          }

          for (const [productId, itemsGroup] of bbGroups.entries()) {
            const bbConfig = await tx.product_blindboxes.findUnique({
              where: { product_id: productId }
            });
            if (!bbConfig) throw new BadRequestException("Blindbox config missing");

            const totalQuantity = itemsGroup.reduce((sum, item) => sum + item.quantity, 0);

            // Fetch ALL unique items for this blindbox product simultaneously so they do not overlap
            const wonVariants = await this.blindboxesService.pickUniqueItems(tx, bbConfig, totalQuantity);
            
            const ticketVariant = await tx.product_variants.findFirst({
              where: { product_id: productId, option_name: 'Blindbox Ticket' }
            }) || itemsGroup[0].variant;

            let wonIndex = 0;
            for (const bItem of itemsGroup) {
              for (let i = 0; i < bItem.quantity; i++) {
                const won = wonVariants[wonIndex++];
                retailItems.push({
                  ...bItem,
                  variant: ticketVariant,
                  quantity: 1, // Enforce uniqueness mathematically
                  _allocated_product_id: won.variant_id,
                  _is_opened: false,
                  _metadata: { source: (won as any)._source_stock || 'AVAILABLE' }
                });
              }
            }
          }
        }

        // --- B. PRE-ORDERS PROCESSING ---
        if (preOrderItems.length > 0) {
          for (const pItem of preOrderItems) {
            const { variant, quantity } = pItem;

            // --- GUARD: Kiểm tra hạn đặt cọc ---
            const preConfig = variant.product_preorder_configs;
            if (preConfig?.booking_end_date && new Date() > new Date(preConfig.booking_end_date)) {
              throw new BadRequestException(
                `Thời gian đặt cọc cho sản phẩm "${variant.sku}" đã kết thúc. Pre-order này không còn nhận đơn mới.`
              );
            }
            // ------------------------------------

            await this.validateAntiScalping(tx, userId, variant.variant_id, quantity, preConfig?.max_qty_per_user || 2);

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
          let hasFlashSaleItem = false;
          const rtOrderItemsData: any[] = [];

          for (const rItem of retailItems) {
            const { variant, quantity, price, _allocated_product_id, _is_opened, _metadata, _backendVerifiedPrice } = rItem;
            const livestreamId = rItem.livestreamId ? Number(rItem.livestreamId) : null;

            // --- 1. ATOMIC RETAIL STOCK DEDUCTION (Global Pool) ---
            // TRỰC TIẾP TRỪ KHO (Atomic): 
            // - Bỏ qua cho Blindbox đã được allocate ruột (vì đã trừ ruột rồi).
            // - Bỏ qua cho Giveaway Prize (vì đã trừ lúc recordWinner).
            // - TẤT CẢ các trường hợp khác (Retail, Livestream, Flash Sale) PHẢI TRỪ KHO để tránh bán quá số lượng.

            const isGiveaway = !!rItem.giveaway_claim_id;
            const isAllocatedBlindbox = !!_allocated_product_id;

            if (!isGiveaway && !isAllocatedBlindbox) {
              const stockUpdateResult = await tx.product_variants.updateMany({
                where: {
                  variant_id: variant.variant_id,
                  stock_available: { gte: quantity }
                },
                data: { stock_available: { decrement: quantity } }
              });

              if (stockUpdateResult.count === 0) {
                this.logger.error(`[OUT OF STOCK] Variant: ${variant.variant_id} | SKU: ${variant.sku} | Quantity Requested: ${quantity}`);
                throw new BadRequestException(`Product ${variant.sku} is out of stock or was just purchased by someone else. Please update your cart.`);
              }
            }

            // --- 2. AUTHORITATIVE PRICE CALCULATION (Zero-Trust) ---
            let authoritativePrice = _backendVerifiedPrice !== undefined ? _backendVerifiedPrice : Number(variant.price);

            // PRIZE OVERRIDE: If it's a claim, it MUST be 0
            if (rItem.giveaway_claim_id) authoritativePrice = 0;

            let shouldCheckFlashStock = false;

            if (livestreamId) {
              const liveConfig = await tx.livestream_products.findUnique({
                where: { livestream_id_variant_id: { livestream_id: livestreamId, variant_id: variant.variant_id } }
              });

              if (liveConfig && liveConfig.flash_sale_price && Number(liveConfig.flash_sale_price) > 0) {
                authoritativePrice = Number(liveConfig.flash_sale_price);
                shouldCheckFlashStock = true;
                hasFlashSaleItem = true; // Mark order for 5-min deadline
              } else if (liveConfig && liveConfig.live_price && Number(liveConfig.live_price) > 0) {
                authoritativePrice = Number(liveConfig.live_price);
              } else {
                authoritativePrice = Number(variant.price) * 0.98; // Default live discount
              }
            }

            // SECURITY: Reject if price deviates (Allow price mismatch for prizes since it's forced to 0 anyway)
            if (!rItem.giveaway_claim_id && Math.abs(Number(price) - authoritativePrice) > 1) {
              this.logger.error(`[PRICE MISMATCH] SKU: ${variant.sku} | Client Sent: ${price} | Backend Expected: ${authoritativePrice} | _backendVerifiedPrice: ${_backendVerifiedPrice} | LivestreamId: ${livestreamId}`);
            }
            // SECURITY: Reject if price deviates (skip for giveaway prizes — price is always 0)
            if (!rItem.giveaway_claim_id && Math.abs(Number(price) - authoritativePrice) > 1) {
              const appliedPromoId = variant.product_promotion_id;
              this.logger.error(`[PRICE MISMATCH] SKU: ${variant.sku} | Client Sent: ${price} | Backend Expected: ${authoritativePrice} | _backendVerifiedPrice: ${_backendVerifiedPrice} | Applied Promo ID: ${appliedPromoId} | LivestreamId: ${livestreamId}`);
              throw new BadRequestException(`Product price for ${variant.sku} has changed. Please update your cart.`);
            }

            // --- 3. ATOMIC FLASH SALE STOCK POOL ENFORCEMENT ---
            if (shouldCheckFlashStock && livestreamId) {
              const fsUpdateResult = await tx.livestream_products.updateMany({
                where: {
                  livestream_id: livestreamId,
                  variant_id: variant.variant_id,
                  flash_sale_stock: { gte: quantity }
                },
                data: { flash_sale_stock: { decrement: quantity } }
              });

              if (fsUpdateResult.count === 0) {
                throw new BadRequestException(`Flash Sale slot for ${variant.sku} is sold out. Please update your cart.`);
              }

              // AUTO-REVERT: Clear price if stock hits zero
              const revertResult = await tx.livestream_products.updateMany({
                where: { livestream_id: livestreamId, variant_id: variant.variant_id, flash_sale_stock: { lte: 0 } },
                data: { flash_sale_price: 0, flash_sale_stock: 0 }
              });

              if (revertResult.count > 0) {
                this.livestreamLiveGateway.broadcastProductUpdate(`LIVE-${livestreamId}`, variant.variant_id);
              }
            }

            // --- 3.1. ATOMIC GENERAL FLASH SALE QUOTA ENFORCEMENT ---
            if (rItem._applied_flash_sale && !rItem._is_livestream_flash_sale && rItem._flash_sale_item_id) {
              const fsUpdateResult = await tx.$executeRaw`
                UPDATE "promotion_items"
                SET "sold" = "sold" + ${quantity}
                WHERE "item_id" = ${rItem._flash_sale_item_id}
                AND ("sold" + ${quantity}) <= "quota"
              `;

              if (Number(fsUpdateResult) === 0) {
                throw new BadRequestException(`Flash Sale quota exceeded for ${variant.sku}. Please update your cart.`);
              }
              this.logger.log(`[FlashSale] Incremented sold count for Item #${rItem._flash_sale_item_id} (Qty: ${quantity})`);
            }

            rtTotalAmountVerified += Number(price) * quantity;
            rtTotalWeight += (variant.weight_g || 200) * quantity;

            rtOrderItemsData.push({
              variant_id: variant.variant_id,
              quantity: quantity,
              unit_price: price,
              total_price: Number(price) * quantity,
              allocated_product_id: _allocated_product_id || null,
              is_opened: _is_opened ?? false,
              livestream_id: livestreamId,
              giveaway_claim_id: rItem.giveaway_claim_id || null,
              metadata: _metadata || undefined
            });

            // BROADCAST: Update stock meter in real-time
            if (livestreamId) {
              this.livestreamLiveGateway.broadcastProductUpdate(`LIVE-${livestreamId}`, variant.variant_id);
            }
          }

          let customerShippingFee = 30000;
          if (isVoucherFreeShip) customerShippingFee = 0;

          // FAIRNESS: Shorter deadline for Flash Sales (5 mins) vs Retail (15 mins)
          const effectiveDeadline = new Date();
          effectiveDeadline.setMinutes(effectiveDeadline.getMinutes() + (hasFlashSaleItem ? 5 : 15));

          const finalTotalBeforeShipping = Math.max(0, rtTotalAmountVerified - orderVoucherDiscountAmount);
          const rtFinalTotal = finalTotalBeforeShipping + customerShippingFee;

          const rtOrder = await tx.orders.create({
            data: {
              user_id: userId,
              order_code: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              shipping_address_id,
              total_amount: rtFinalTotal,
              discount_amount: orderVoucherDiscountAmount,
              shipping_fee: customerShippingFee,
              original_shipping_fee: 30000,
              payment_method_code,
              payment_ref_code: paymentRefCode,
              status_code: 'PENDING_PAYMENT',
              payment_deadline: effectiveDeadline,
              channel_code: 'WEB',
              promotion_id: usedDiscountPromotionId,
              shipping_promotion_id: usedFreeShipPromotionId,
              order_items: { create: rtOrderItemsData },
              order_status_history: { create: { new_status: 'PENDING_PAYMENT', note: hasFlashSaleItem ? 'Flash Sale Order (5-min Hold)' : 'Retail Order (15-min Hold)' } }
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

        // --- E. UPDATE GIVEAWAY CLAIMS ---
        const claimIds = validatedItems.map(i => i.giveaway_claim_id).filter(id => !!id);
        if (claimIds.length > 0) {
          await tx.giveaway_claims.updateMany({
            where: { claim_id: { in: claimIds } },
            data: { status_code: 'CLAIMED', updated_at: new Date() }
          });
        }

        if (usedDiscountPromotionId) {
          await tx.user_vouchers.updateMany({
            where: { user_id: userId, promotion_id: usedDiscountPromotionId, status: 'COLLECTED' },
            data: { status: 'USED', used_at: new Date() }
          });
        }
        if (usedFreeShipPromotionId) {
          await tx.user_vouchers.updateMany({
            where: { user_id: userId, promotion_id: usedFreeShipPromotionId, status: 'COLLECTED' },
            data: { status: 'USED', used_at: new Date() }
          });
        }

        return ordersResults;
      });

      const totalAmount = createdOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);
      const orderIds = createdOrders.map(o => o.order_id);

      // NOTE: new_order broadcast to livestream admin is intentionally NOT done here.
      // It will be emitted ONLY after SUCCESSFUL PAYMENT (see mockPayGroup / payWithWallet / webhook handler).
      // Reason: createOrder sets status = PENDING_PAYMENT (draft). Broadcasting here causes false +1 order counts.

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
    return orders.map(o => ({
      ...o,
      addresses: this.decryptAddress(o.addresses) as any
    }));
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
    return orders.map(o => ({
      ...o,
      addresses: this.decryptAddress(o.addresses) as any
    }));
  }

  // --- NEW: PRIVATE HELPER TO APPLY VOUCHER TO A GROUP OF ORDERS ---
  private async _applyVoucherToGroup(tx: any, userId: number, orders: any[], voucherId: number) {
    const voucher = await tx.user_vouchers.findFirst({
      where: { id: voucherId, user_id: userId, status: 'COLLECTED' },
      include: { promotions: true }
    });

    if (!voucher) throw new BadRequestException("Voucher not found, expired, or already used.");
    const promo = voucher.promotions;
    if (!promo) throw new BadRequestException("Invalid promotion data.");

    // 1. Expiry Check
    const now = new Date();
    if (promo.end_date && new Date(promo.end_date) < now) {
      await tx.user_vouchers.update({ where: { id: voucherId }, data: { status: 'EXPIRED' } });
      throw new BadRequestException("This voucher has expired.");
    }

    // 2. Rank Check (Final Safety)
    if (promo.apply_rank_code) {
      const customer = await tx.customers.findUnique({ where: { user_id: userId } });
      if (customer?.current_rank_code !== promo.apply_rank_code) {
        throw new BadRequestException(`Voucher requires ${promo.apply_rank_code} rank.`);
      }
    }

    // 3. Min Order Value Check
    const groupSubtotal = orders.reduce((sum, o) => sum + (Number(o.total_amount) - Number(o.shipping_fee || 0) + Number(o.discount_amount || 0)), 0);
    if (promo.min_order_value && groupSubtotal < Number(promo.min_order_value)) {
      throw new BadRequestException(`Minimum order value of ${new Intl.NumberFormat('vi-VN').format(Number(promo.min_order_value))}đ not met.`);
    }

    // 4. Calculate Discount
    let totalDiscount = 0;
    if (promo.discount_type === 'PERCENTAGE') {
      let calculated = groupSubtotal * (Number(promo.discount_value) / 100);
      const maxCap = Number(promo.max_discount_amount);
      if (maxCap > 0) {
        calculated = Math.min(calculated, maxCap);
      }
      totalDiscount = Math.round(calculated);
    } else if (promo.discount_type === 'FIXED_AMOUNT') {
      totalDiscount = Number(promo.discount_value);
    } else if (promo.discount_type === 'FREE_SHIP') {
      // Handled separately below
    }

    // 5. Apply to orders
    if (promo.discount_type === 'FREE_SHIP') {
      for (const order of orders) {
        await tx.orders.update({
          where: { order_id: order.order_id },
          data: {
            shipping_fee: 0,
            total_amount: { decrement: order.shipping_fee || 0 },
            shipping_promotion_id: promo.promotion_id
          }
        });
        // Update local ref for subsequent payment logic
        order.total_amount = Number(order.total_amount) - Number(order.shipping_fee || 0);
      }
    } else if (totalDiscount > 0) {
      // Apply discount to the first order that has enough total_amount, or divide it
      let remainingDiscount = totalDiscount;
      for (const order of orders) {
        if (remainingDiscount <= 0) break;
        const currentOrderTotal = Number(order.total_amount);
        const applyNow = Math.min(remainingDiscount, currentOrderTotal);

        await tx.orders.update({
          where: { order_id: order.order_id },
          data: {
            discount_amount: { increment: applyNow },
            total_amount: { decrement: applyNow },
            promotion_id: promo.promotion_id
          }
        });

        order.total_amount = Number(order.total_amount) - applyNow;
        remainingDiscount -= applyNow;
      }
    }

    // 6. Mark Voucher as USED
    await tx.user_vouchers.update({
      where: { id: voucherId },
      data: { status: 'USED', used_at: new Date() }
    });

    return true;
  }

  // --- NEW: PRIVATE HELPER TO SEND NOTIFICATIONS FOR A GROUP ---
  private async _sendGroupNotifications(paymentRefCode: string, userId: number) {
    try {
      const updatedOrders = await this.prisma.orders.findMany({
        where: { payment_ref_code: paymentRefCode, user_id: userId },
        include: {
          users: true,
          order_items: { include: { product_variants: { include: { products: true } } } }
        }
      });

      for (const order of updatedOrders) {
        // Sync Auction status if applicable
        if (order.order_code && order.order_code.startsWith('AUC-')) {
          try {
            const auctionId = parseInt(order.order_code.split('-')[1], 10);
            await this.prisma.auctions.update({
              where: { auction_id: auctionId },
              data: { status_code: 'COMPLETED' }
            });
            this.logger.log(`Synced Auction #${auctionId} to COMPLETED`);
          } catch (err) {
            this.logger.error(`Auction sync error for ${order.order_code}:`, err);
          }
        }

        // Send Email & Socket
        if (order.users) {
          const decryptedUser = this.decryptUser(order.users);
          if (decryptedUser && decryptedUser.email) {
            this.mailService.sendOrderConfirmation(decryptedUser, order).catch(e => this.logger.error("Mail Error", e));
          }
        }
        this.eventsGateway.notifyNewOrder(order);
      }
    } catch (error) {
      this.logger.error("Failed to send group notifications", error);
    }
  }

  // --- NEW: MOCK PAYMENT FOR GROUP ---
  async mockPayGroup(paymentRefCode: string, userId: number, voucherId?: number) {
    if (!paymentRefCode) throw new BadRequestException("Payment Ref Code required");

    const orders = await this.prisma.orders.findMany({
      where: { payment_ref_code: paymentRefCode, user_id: userId }
    });

    if (orders.length === 0) throw new NotFoundException("No orders found for this payment ref");

    const validStatuses = ['PENDING_PAYMENT', 'WAITING_DEPOSIT'];
    const invalid = orders.find(o => !validStatuses.includes(o.status_code || ''));
    if (invalid) throw new BadRequestException("Some orders in this group are already processed or cancelled.");

    const result = await this.prisma.$transaction(async (tx) => {
      if (voucherId) {
        await this._applyVoucherToGroup(tx, userId, orders, voucherId);
      }

      for (const order of orders) {
        const newStatus = order.status_code === 'PENDING_PAYMENT' ? 'PROCESSING' : 'DEPOSITED';
        await tx.orders.update({
          where: { order_id: order.order_id },
          data: {
            status_code: newStatus,
            paid_amount: order.total_amount,
            payment_method_code: 'MOCK_PAY'
          }
        });

        if (newStatus === 'DEPOSITED') {
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
      return { success: true, count: orders.length };
    });

    // Notify in background
    this._sendGroupNotifications(paymentRefCode, userId).catch(() => { });

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
          // Send Email (Decrypt user first)
          const decryptedUser = this.decryptUser(order.users);
          this.mailService.sendOrderConfirmation(decryptedUser, order).catch(e => console.error("Mail Error", e));
        }
        // ✅ FIX: Only notify warehouse for PROCESSING orders (retail paid).
        // DEPOSITED preorders must NOT appear in packing queue — they wait for inventory import → FIFO → final payment.
        if (order.status_code === 'PROCESSING') {
          this.eventsGateway.notifyNewOrder(order);
          // Emit Socket (livestream room) — ONLY on successful payment
          await this._broadcastLivestreamOrder(order);
        }
      }
      this.logger.log(`Notifications sent for group ${paymentRefCode}`);

    } catch (error) {
      console.error("Failed to send notifications for group payment", error);
    }

    return result;
  }

  // --- NEW: WALLET PAYMENT FOR GROUP ---
  async payWithWallet(paymentRefCode: string, userId: number, voucherId?: number) {
    if (!paymentRefCode) throw new BadRequestException("Payment Ref Code required");

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // ✅ FIX Bug 1: Include BOTH PENDING_PAYMENT (retail) AND WAITING_DEPOSIT (preorder)
        const validStatuses = ['PENDING_PAYMENT', 'WAITING_DEPOSIT'];
        const orders = await tx.orders.findMany({
          where: { payment_ref_code: paymentRefCode, user_id: userId, status_code: { in: validStatuses } }
        });

        if (!orders.length) throw new BadRequestException("No pending orders found for this payment ref.");

        // Validate no already-processed orders exist in this group
        const allGroupOrders = await tx.orders.findMany({
          where: { payment_ref_code: paymentRefCode, user_id: userId }
        });
        const alreadyProcessed = allGroupOrders.find(o => !validStatuses.includes(o.status_code || ''));
        if (alreadyProcessed) {
          throw new BadRequestException('Some orders in this group are already processed or cancelled.');
        }

        if (voucherId) {
          await this._applyVoucherToGroup(tx, userId, orders, voucherId);
        }

        const totalAmount = orders.reduce((sum, o) => sum + Number(o.total_amount), 0);
        const wallet = await tx.wallets.findUnique({ where: { user_id: userId } });

        if (!wallet) throw new BadRequestException("Wallet not found.");
        if (Number(wallet.balance_available) < totalAmount) throw new BadRequestException("Insufficient balance.");

        await tx.wallets.update({
          where: { wallet_id: wallet.wallet_id },
          data: { balance_available: { decrement: totalAmount } }
        });

        for (const order of orders) {
          // ✅ FIX Bug 1: Retail → PROCESSING, Preorder deposit → DEPOSITED (not PROCESSING)
          const newStatus = order.status_code === 'WAITING_DEPOSIT' ? 'DEPOSITED' : 'PROCESSING';

          await tx.orders.update({
            where: { order_id: order.order_id },
            data: { status_code: newStatus, paid_amount: order.total_amount, payment_method_code: 'WALLET' }
          });

          await tx.order_status_history.create({
            data: {
              order_id: order.order_id,
              previous_status: order.status_code,
              new_status: newStatus,
              note: `Paid via FigiWallet. Group Ref: ${paymentRefCode}`
            }
          });

          // ✅ FIX Bug 1: Update preorder contract to DEPOSITED when deposit paid via wallet
          if (newStatus === 'DEPOSITED') {
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

        await tx.wallet_transactions.create({
          data: {
            wallet_id: wallet.wallet_id,
            type_code: 'PAYMENT',
            amount: -totalAmount,
            reference_code: paymentRefCode,
            description: `Payment for group ${paymentRefCode}`
          }
        });

        return { success: true, totalPaid: totalAmount };
      });

      // Notify in background
      this._sendGroupNotifications(paymentRefCode, userId).catch(() => { });

      // --- NEW: SYNC AUCTION STATUS ---
      const updatedOrdersForAuction = await this.prisma.orders.findMany({
        where: { payment_ref_code: paymentRefCode, user_id: userId },
        include: { users: true }
      });

      for (const order of updatedOrdersForAuction) {
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

      for (const order of updatedOrdersForAuction) {
        if (order.users) {
          const decryptedUser = this.decryptUser(order.users);
          this.mailService.sendOrderConfirmation(decryptedUser, order).catch(e => console.error("Mail Error", e));
        }
        // ✅ FIX: Preorder DEPOSITED orders must NOT trigger warehouse packing queue
        if (order.status_code === 'PROCESSING') {
          this.eventsGateway.notifyNewOrder(order);
          await this._broadcastLivestreamOrder(order);
        }
      }
      this.logger.log(`Wallet Payment successful for group ${paymentRefCode}`);
      return result;

    } catch (error) {
      this.logger.error("Wallet Payment Error:", error);
      if (error instanceof BadRequestException) throw error;
    }
  }

  /**
   * Broadcast a confirmed (paid) order to the livestream admin room.
   * Called ONLY after order status transitions to PROCESSING.
   */
  private async _broadcastLivestreamOrder(order: any): Promise<void> {
    try {
      const itemsByLivestream: Record<number, any[]> = {};

      // 1. Group items by livestream_id
      const items = order.order_items || [];
      for (const item of items) {
        if (!item.livestream_id) continue;
        if (!itemsByLivestream[item.livestream_id]) {
          itemsByLivestream[item.livestream_id] = [];
        }
        itemsByLivestream[item.livestream_id].push(item);
      }

      // 2. For each livestream, calculate and broadcast
      const customerName = order.users?.full_name || 'Khách hàng';
      const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

      for (const [lsId, lsItems] of Object.entries(itemsByLivestream)) {
        const commercialItems = lsItems.filter(i => !i.giveaway_claim_id);
        const giveawayItems = lsItems.filter(i => !!i.giveaway_claim_id);

        // --- A. COMMERCIAL BROADCAST ---
        if (commercialItems.length > 0) {
          const mainItem = commercialItems[0];
          const mainName = mainItem.product_variants?.products?.name || mainItem.product_variants?.option_name || 'Sản phẩm';
          const extraCount = commercialItems.length - 1;
          const commercialTotal = commercialItems.reduce((sum, i) => sum + Number(i.total_price), 0);

          this.livestreamLiveGateway.broadcastOrder(`LIVE-${lsId}`, {
            customer_name: customerName,
            product_name: extraCount > 0 ? `${mainName} + ${extraCount} items` : mainName,
            quantity: commercialItems.reduce((sum, i) => sum + i.quantity, 0),
            amount: commercialTotal,
            time: timeStr,
            type: 'COMMERCIAL'
          });
        }

        // --- B. GIVEAWAY BROADCAST (Increased Interaction) ---
        if (giveawayItems.length > 0) {
          for (const gItem of giveawayItems) {
            const pName = gItem.product_variants?.products?.name || gItem.product_variants?.option_name || 'Giải thưởng';
            // We use a different event or flag it as Giveaway
            this.livestreamLiveGateway.broadcastOrder(`LIVE-${lsId}`, {
              customer_name: customerName,
              product_name: pName,
              quantity: gItem.quantity,
              amount: 0,
              time: timeStr,
              type: 'GIVEAWAY'
            });
          }
        }
      }
    } catch (err) {
      this.logger.error('Failed to broadcast livestream order:', err);
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
    const decryptedUser = this.decryptUser(fullOrder.users);
    this.mailService.sendOrderConfirmation(decryptedUser, fullOrder);
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

        // (Blindbox ticket virtual stock is no longer restored as it's never deducted)
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

        // 4. Restore Livestream Flash Sale Quota
        if (item.livestream_id) {
          const livePromo = await tx.livestream_products.findUnique({
            where: { livestream_id_variant_id: { livestream_id: item.livestream_id, variant_id: item.variant_id } }
          });
          if (livePromo && livePromo.flash_sale_price) {
            await tx.livestream_products.update({
              where: { livestream_id_variant_id: { livestream_id: item.livestream_id, variant_id: item.variant_id } },
              data: { flash_sale_stock: { increment: item.quantity } }
            });
            this.logger.log(`[Expire] Restored ${item.quantity} quota to Livestream Product Flash Sale!`);
          }
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
            data: order.order_items.map((item: any) => ({
              cart_id: cart!.cart_id,
              variant_id: item.variant_id,
              quantity: item.quantity,
              livestream_id: item.livestream_id || null
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
          // Find the user_voucher record and restore status to COLLECTED
          const usedVoucher = await tx.user_vouchers.findFirst({
            where: {
              user_id: order.user_id,
              promotion_id: promoId,
              status: 'USED'
            },
            orderBy: {
              updated_at: 'desc' // Try to get the one most recently used
            }
          });

          if (usedVoucher) {
            await tx.user_vouchers.update({
              where: { id: usedVoucher.id },
              data: { status: 'COLLECTED', used_at: null }
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
    const orders = await this.prisma.orders.findMany({
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

    return orders.map(o => ({
      ...o,
      addresses: this.decryptAddress(o.addresses)
    }));
  }

  async findAllByUser(userId: number) {
    const orders = await this.prisma.orders.findMany({
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

    return orders.map(o => ({
      ...o,
      addresses: this.decryptAddress(o.addresses)
    }));
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

    // Audit Logging if staff accesses someone else's order
    if (isStaff && order.user_id !== user?.userId) {
      const requestingUserId = Number(user.userId || user.id || user.sub || user.user_id);
      await this.logPiiAccess(requestingUserId, order.user_id, ['order_address'], user.ip);
    }

    // Decrypt Address
    order.addresses = this.decryptAddress(order.addresses) as any;

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
    const contracts = await this.prisma.preorder_contracts.findMany({
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

    return contracts.map(c => ({
      ...c,
      deposit_order: c.deposit_order ? {
        ...c.deposit_order,
        addresses: this.decryptAddress(c.deposit_order.addresses)
      } : null
    }));
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

      // ✅ Guard: Only allow final payment when stock has arrived and been allocated (FIFO)
      if (contract.status_code !== 'READY_FOR_PAYMENT') {
        throw new BadRequestException(`Contract is not ready for final payment (Status: ${contract.status_code}). You will receive an email when your item is ready.`);
      }

      // 2. Validate Original Order Existed
      if (!contract.deposit_order_id) {
        throw new BadRequestException("Corrupt contract: No deposit order linked.");
      }

      // 3. Calculate Amounts
      const config = contract.product_variants.product_preorder_configs;
      if (!config) throw new BadRequestException("Pre-order config missing for variant");

      const fullPrice = Number(config.full_price);
      const shippingFee = 30000;
      const totalAmount = (fullPrice * contract.quantity) + shippingFee;

      let newStatus = 'PROCESSING';
      let additionalPaid = 0;
      let paymentRefCodeStr: string | undefined = undefined;

      // WALLET PAYMENT LOGIC
      // ✅ FIX: Inline wallet deduction using tx directly.
      // Do NOT call walletService.deductBalance() here — it creates a nested $transaction
      // which conflicts with the outer transaction and causes 500 Internal Server Error.
      if (payment_method_code === 'WALLET') {
        const depositPaid = Number(contract.deposit_amount_paid);
        const amountToDeduct = totalAmount - depositPaid;

        if (amountToDeduct < 0) throw new BadRequestException("Invalid payment amount: remaining balance is negative.");

        const wallet = await tx.wallets.findUnique({ where: { user_id: userId } });
        if (!wallet) throw new BadRequestException("Wallet not found.");
        if (Number(wallet.balance_available) < amountToDeduct) throw new BadRequestException("Insufficient wallet balance.");

        await tx.wallets.update({
          where: { wallet_id: wallet.wallet_id },
          data: { balance_available: { decrement: amountToDeduct } }
        });

        await tx.wallet_transactions.create({
          data: {
            wallet_id: wallet.wallet_id,
            type_code: 'PAYMENT',
            amount: -amountToDeduct,
            reference_code: `ORD-${contract.deposit_order_id}`,
            description: `Final Payment for Pre-order Contract #${contractId}`
          }
        });

        newStatus = 'PROCESSING';
        additionalPaid = amountToDeduct;
      } else if (payment_method_code === 'BANKING') {
        newStatus = 'PENDING_FINAL_PAYMENT';
        paymentRefCodeStr = `PAY${Date.now()}${Math.floor(Math.random() * 1000)}`;
      }

      // 4. MUTATE the Original Deposit Order (Single ID Strategy)
      const updatedOrder = await tx.orders.update({
        where: { order_id: contract.deposit_order_id },
        data: {
          status_code: newStatus,
          total_amount: totalAmount,
          shipping_fee: shippingFee,
          shipping_address_id,
          payment_method_code,
          paid_amount: { increment: additionalPaid },
          payment_ref_code: paymentRefCodeStr !== undefined ? paymentRefCodeStr : undefined,
          updated_at: new Date(),
          order_status_history: {
            create: { new_status: newStatus, note: 'Pre-order Final Payment Completed (Single ID)' }
          }
        }
      });

      // 5. Update Contract status
      await tx.preorder_contracts.update({
        where: { contract_id: contractId },
        data: {
          final_payment_order_id: contract.deposit_order_id,
          status_code: newStatus === 'PROCESSING' ? 'COMPLETED' : 'READY_FOR_PAYMENT',
          updated_at: new Date()
        }
      });

      // 6. Notify warehouse after commit (fire-and-forget, only for PROCESSING = fully paid)
      if (newStatus === 'PROCESSING') {
        setImmediate(async () => {
          try {
            const fullOrder = await this.prisma.orders.findUnique({
              where: { order_id: updatedOrder.order_id },
              include: {
                users: true,
                order_items: { include: { product_variants: { include: { products: true } } } }
              }
            });
            if (fullOrder) {
              this.eventsGateway.notifyNewOrder(fullOrder);
              if (fullOrder.users) {
                const decUser = this.decryptUser(fullOrder.users);
                this.mailService.sendOrderConfirmation(decUser, fullOrder).catch(e => this.logger.error("Final Payment Mail Error", e));
              }
            }
          } catch (e) {
            this.logger.error("Post final-payment notification error", e);
          }
        });
      }

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

    if (contract.deposit_order) {
      (contract.deposit_order as any).addresses = this.decryptAddress(contract.deposit_order.addresses);
    }

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
            // --- CRITICAL GIVEAWAY FIX: DON'T REVERT STOCK ---
            // Giveaway stock was deducted during winner pick and belongs to the user.
            // Cancelling the order means it stays in the user's cart (reserved).
            if (!item.giveaway_claim_id) {
              await tx.product_variants.update({
                where: { variant_id: targetVariantId },
                data: { stock_available: { increment: item.quantity } }
              });
            }
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

          // FIX: Restore Livestream Flash Sale Quota
          if (item.livestream_id) {
            const livePromo = await tx.livestream_products.findUnique({
              where: { livestream_id_variant_id: { livestream_id: item.livestream_id, variant_id: item.variant_id } }
            });
            if (livePromo && livePromo.flash_sale_price) {
              await tx.livestream_products.update({
                where: { livestream_id_variant_id: { livestream_id: item.livestream_id, variant_id: item.variant_id } },
                data: { flash_sale_stock: { increment: item.quantity } }
              });
              this.logger.log(`[Cancel] Restored ${item.quantity} quota to Livestream Product Flash Sale!`);
            }
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
          // GROUP ITEMS TO PREVENT CART CLUTTER
          const mergedItems = new Map<string, any>();
          
          for (const item of order.order_items) {
            if (item.giveaway_claim_id) {
              // Prizes are strictly 1 quantity each row
              await tx.cart_items.create({
                data: {
                  cart_id: cart.cart_id,
                  variant_id: item.variant_id,
                  quantity: item.quantity,
                  livestream_id: item.livestream_id,
                  giveaway_claim_id: item.giveaway_claim_id,
                  payment_option: 'FULL_PAYMENT'
                }
              });
            } else {
              // Note: payment_option might be stored on order_items depending on schema, if not rely on order level.
              // We'll safely merge by variant and livestream.
              const key = `${item.variant_id}-${item.livestream_id || 'null'}`;
              if (mergedItems.has(key)) {
                mergedItems.get(key).quantity += item.quantity;
              } else {
                mergedItems.set(key, { ...item });
              }
            }
          }

          for (const v of mergedItems.values()) {
            const existingInCart = await tx.cart_items.findFirst({
               where: {
                   cart_id: cart.cart_id,
                   variant_id: v.variant_id,
                   livestream_id: v.livestream_id,
                   deleted_at: null
               }
            });

            if (existingInCart) {
               await tx.cart_items.update({
                   where: { item_id: existingInCart.item_id },
                   data: { quantity: { increment: v.quantity } }
               });
            } else {
               await tx.cart_items.create({
                   data: {
                       cart_id: cart.cart_id,
                       variant_id: v.variant_id,
                       quantity: v.quantity,
                       livestream_id: v.livestream_id
                   }
               });
            }
          }
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
              status: 'USED'
            },
            orderBy: {
              updated_at: 'desc'
            }
          });

          if (usedVoucher) {
            await tx.user_vouchers.update({
              where: { id: usedVoucher.id },
              data: { status: 'COLLECTED', used_at: null }
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
      const decryptedUser = this.decryptUser(order.users);
      this.mailService.sendShippingUpdate(decryptedUser, order);
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

    const updatedOrder = await this.prisma.orders.update({
      where: { order_id: order.order_id },
      data: { status_code: status }
    });

    // Notify Real-time for Defense Presentation (Teammate with Postman -> Presenter machine UI)
    this.eventsGateway.notifyOrderStatusUpdate(order.order_id, status, updatedOrder);

    return updatedOrder;
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
      const decryptedUser = this.decryptUser(order.users);
      this.mailService.sendDeliverySuccess(decryptedUser, order, earnedPoints);
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

    // E. Trigger Real-time Notification
    this.eventsGateway.notifyOrderStatusUpdate(order.order_id, 'COMPLETED');

    return { success: true, message: `Order ${trackingCode} completed and points added.` };
  }
  /** Log a PII access event when staff views sensitive order data */
  private async logPiiAccess(accessedBy: number, targetUserId: number | null, fieldsViewed: string[], ip?: string) {
    if (!targetUserId) return;
    try {
      await this.prisma.pii_access_logs.create({
        data: {
          accessed_by: accessedBy,
          target_user_id: targetUserId,
          fields_viewed: fieldsViewed.join(','),
          ip_address: ip || null,
        }
      });
    } catch (e) {
      console.error('[PII Audit] Failed to write audit log:', e.message);
    }
  }

  // --- GIVEAWAY LOGIC ---



  async createGiveawayClaim(userId: number, variantId: number, livestreamId: number, giveawayId?: number) {
    return await this.prisma.$transaction(async (tx) => {
      // Deduct stock immediately to reserve it
      const variant = await tx.product_variants.findUnique({ where: { variant_id: variantId } });
      if (!variant || variant.stock_available <= 0) throw new BadRequestException("Item out of stock!");

      await tx.product_variants.update({
        where: { variant_id: variantId },
        data: { stock_available: { decrement: 1 } }
      });

      const claim = await tx.giveaway_claims.create({
        data: {
          user_id: userId,
          variant_id: variantId,
          livestream_id: livestreamId,
          giveaway_id: giveawayId,
          status_code: 'PENDING'
        }
      });
      return { type: 'CLAIM', claim };
    });
  }

  async claimGiveawayPrize(userId: number, claimId: number) {
    const claim = await this.prisma.giveaway_claims.findUnique({
      where: { claim_id: claimId, user_id: userId, status_code: 'PENDING' }
    });

    if (!claim) throw new BadRequestException("Claim not found or already processed");

    const address = await this.prisma.addresses.findFirst({
      where: { user_id: userId, deleted_at: null },
      orderBy: { is_default: 'desc' }
    });

    if (!address) throw new BadRequestException("Please add a shipping address to your profile first.");

    return await this.prisma.$transaction(async (tx) => {
      // Stock was already deducted when the claim was created (reservation)

      // Create Order
      const order = await tx.orders.create({
        data: {
          user_id: userId,
          order_code: `GIVE-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          shipping_address_id: address.address_id,
          total_amount: 0,
          shipping_fee: 0,
          original_shipping_fee: 0,
          payment_method_code: 'GIVEAWAY',
          status_code: 'PROCESSING',
          channel_code: 'LIVESTREAM',
          note: `[LIVESTREAM GIVEAWAY] Claimed from Prize #${claimId}`,
          order_items: {
            create: [{
              variant_id: claim.variant_id,
              quantity: 1,
              unit_price: 0,
              total_price: 0,
              livestream_id: claim.livestream_id
            }]
          },
          order_status_history: {
            create: { new_status: 'PROCESSING', note: 'Giveaway Prize Claimed' }
          }
        }
      });

      // Mark claim as CLAIMED
      await tx.giveaway_claims.update({
        where: { claim_id: claimId },
        data: { status_code: 'CLAIMED' }
      });

      return order;
    });
  }
  async findPendingClaims(userId: number, livestreamId?: number) {
    return this.prisma.giveaway_claims.findMany({
      where: {
        user_id: userId,
        livestream_id: livestreamId,
        status_code: 'PENDING'
      },
      include: {
        product_variants: {
          include: {
            products: true
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });
  }

  // --- WAREHOUSE & BUSINESS KPI DASHBOARD ---
  async getDashboardKPIs() {
    const now = new Date();
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const getStatsForTimeframe = async (start: Date, end?: Date) => {
      const dateFilter = end ? { gte: start, lte: end } : { gte: start };

      const [
        packedOrders, totalOrders, totalOnlineOrders, totalLivestreamOrders,
        onlineOrders, livestreamOrders, preorderContracts, shipments, collectedShipping,
      ] = await Promise.all([
        this.prisma.orders.count({ where: { packed_at: dateFilter, deleted_at: null } }),
        this.prisma.orders.count({ where: { created_at: dateFilter, deleted_at: null } }),
        this.prisma.orders.count({ where: { channel_code: 'WEB', created_at: dateFilter, deleted_at: null } }),
        this.prisma.orders.count({ where: { channel_code: 'LIVESTREAM', created_at: dateFilter, deleted_at: null } }),
        this.prisma.orders.aggregate({ _sum: { paid_amount: true }, where: { channel_code: 'WEB', created_at: dateFilter, deleted_at: null } }),
        this.prisma.orders.aggregate({ _sum: { paid_amount: true }, where: { channel_code: 'LIVESTREAM', created_at: dateFilter, deleted_at: null } }),
        this.prisma.preorder_contracts.aggregate({ _sum: { deposit_amount_paid: true }, _count: { contract_id: true }, where: { created_at: dateFilter } }),
        this.prisma.shipments.aggregate({ _sum: { shipping_fee: true }, where: { created_at: dateFilter } }),
        this.prisma.orders.aggregate({ _sum: { shipping_fee: true }, where: { created_at: dateFilter, deleted_at: null, shipments: { isNot: null } } }),
      ]);

      return {
        packedOrders, totalOrders, totalOnlineOrders, totalLivestreamOrders,
        onlineRevenue: Number(onlineOrders._sum.paid_amount || 0),
        livestreamRevenue: Number(livestreamOrders._sum.paid_amount || 0),
        preorderCount: preorderContracts._count.contract_id,
        preorderRevenue: Number(preorderContracts._sum.deposit_amount_paid || 0),
        shippingCollected: Number(collectedShipping._sum.shipping_fee || 0),
        shippingPaid: Number(shipments._sum.shipping_fee || 0),
      };
    };

    const activePreorderContracts = await this.prisma.preorder_contracts.count({
      where: { status_code: { in: ['WAITING_DEPOSIT', 'DEPOSITED'] } },
    });

    const currentMonth = await getStatsForTimeframe(startOfCurrentMonth);
    const previousMonth = await getStatsForTimeframe(startOfPreviousMonth, endOfPreviousMonth);

    const calculateGrowth = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Number((((current - previous) / previous) * 100).toFixed(1));
    };

    return {
      currentMonth,
      previousMonth,
      activePreorderContracts,
      growth: {
        totalOrders: calculateGrowth(currentMonth.totalOrders, previousMonth.totalOrders),
        packedOrders: calculateGrowth(currentMonth.packedOrders, previousMonth.packedOrders),
        onlineRevenue: calculateGrowth(currentMonth.onlineRevenue, previousMonth.onlineRevenue),
        livestreamRevenue: calculateGrowth(currentMonth.livestreamRevenue, previousMonth.livestreamRevenue),
        preorderRevenue: calculateGrowth(currentMonth.preorderRevenue, previousMonth.preorderRevenue),
        preorderCount: calculateGrowth(currentMonth.preorderCount, previousMonth.preorderCount),
        shippingMargin: calculateGrowth(
          currentMonth.shippingCollected - currentMonth.shippingPaid,
          previousMonth.shippingCollected - previousMonth.shippingPaid
        )
      }
    };
  }
}
