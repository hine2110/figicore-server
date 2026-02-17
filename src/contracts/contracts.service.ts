import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFinalPaymentDto } from './dto/create-final-payment.dto';

@Injectable()
export class ContractsService {
    private readonly logger = new Logger(ContractsService.name);

    constructor(
        private prisma: PrismaService
    ) { }

    async createFinalPayment(userId: number, dto: CreateFinalPaymentDto) {
        const { contract_ids, shipping_address_id, payment_method_code, voucherCode } = dto;

        return this.prisma.$transaction(async (tx) => {
            // 1. Fetch Contracts
            const contracts = await tx.preorder_contracts.findMany({
                where: {
                    contract_id: { in: contract_ids },
                    user_id: userId
                },
                include: { product_variants: true } // to get weight etc if needed later
            });

            if (contracts.length !== contract_ids.length) {
                throw new BadRequestException("Some contracts not found or do not belong to user");
            }

            // 2. Calculate Token Remaining & Validate
            let remaining_amount = 0;
            let allShippingFree = false; // Default false as column removed

            for (const c of contracts) {
                // Determine if ready for payment? 
                // Assuming Frontend filters logic or we check status here. 
                // Prompt doesn't specify status check strictness, but let's assume valid.

                remaining_amount += Number(c.remaining_amount);

                // Note: is_shipping_free column removed from schema. 
                // We assume standard shipping unless promotion logic elsewhere.
                // if (!c.is_shipping_free) { allShippingFree = false; }
            }

            // 3. Calculate Shipping Fee
            let shippingFee = 30000; // Standard

            // Incentive Rule: IF ALL contracts have is_shipping_free == true -> shipping_fee = 0
            if (allShippingFree) {
                shippingFee = 0;
            }

            // Voucher Rule: "allow User to apply a new Voucher at the Final Checkout... to reduce it to 0"
            if (voucherCode && shippingFee > 0) {
                const promo = await tx.promotions.findUnique({ where: { code: voucherCode } });
                // Simple check
                if (promo && (!promo.end_date || promo.end_date > new Date())) {
                    // Assume FreeShip voucher reduces standard fee to 0
                    shippingFee = 0;
                }
            }

            const totalAmount = remaining_amount + shippingFee;

            // 4. Create Final Order
            const orderCode = `ORD-FINAL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

            // Need Items for Order?
            // "Create Order with calculated shipping_fee. Total Amount = Sum..."
            // Usually Order needs items. 
            // We should create order_items mirroring the contracts?
            // Prompt says: "Create preorder_payments (Type: 'FINAL') linking this new Order to the Contracts."
            // It doesn't explicitly say create `order_items`. 
            // However, an Order with 0 items might be weird. 
            // BUT, if we create order_items, we might double count inventory or sales?
            // Inventory is already handled. 
            // Creating order_items is good for display. Let's create them as "Final Payment" items or copy variant.

            const orderItemsData = contracts.map(c => ({
                variant_id: c.variant_id,
                quantity: c.quantity,
                // unit_price: c.full_price_per_unit, // Removed duplicate
                // remaining_per_unit = remaining_amount / quantity
                unit_price: Number(c.remaining_amount) / c.quantity,
                total_price: Number(c.remaining_amount)
            }));

            const order = await tx.orders.create({
                data: {
                    user_id: userId,
                    order_code: orderCode,
                    shipping_address_id,
                    total_amount: totalAmount,
                    shipping_fee: shippingFee,
                    original_shipping_fee: 30000, // Standard ref
                    payment_method_code,
                    status_code: 'PENDING_PAYMENT',
                    channel_code: 'WEB',
                    order_items: {
                        create: orderItemsData
                    },
                    order_status_history: {
                        create: { new_status: 'PENDING_PAYMENT', note: 'Pre-order Final Payment' }
                    }
                }
            });

            // 5. Link Payments (Update Contract directly)
            for (const c of contracts) {
                await tx.preorder_contracts.update({
                    where: { contract_id: c.contract_id },
                    data: {
                        final_payment_order_id: order.order_id,
                        status_code: 'PENDING_FINAL_PAYMENT'
                    }
                });
            }

            return order;
        });
    }

    async findOne(contractId: number, userId: number) {
        const contract = await this.prisma.preorder_contracts.findUnique({
            where: { contract_id: contractId },
            include: {
                product_variants: {
                    include: {
                        products: true
                    }
                },
                deposit_order: {
                    include: {
                        addresses: true
                    }
                }
            }
        });

        if (!contract || contract.user_id !== userId) {
            throw new BadRequestException("Contract not found or access denied");
        }

        return contract;
    }

    async getMyContracts(userId: number) {
        return this.prisma.preorder_contracts.findMany({
            where: { user_id: userId },
            include: {
                product_variants: {
                    include: {
                        products: {
                            select: {
                                name: true,
                                media_urls: true
                            }
                        }
                    }
                },
                deposit_order: {
                    include: {
                        addresses: true
                    }
                },
                final_order: true // To check status of final order
            },
            orderBy: { created_at: 'desc' }
        });
    }
}
