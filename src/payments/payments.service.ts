import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { MailService } from '../mail/mail.service';

@Injectable()
export class PaymentsService {
    private readonly logger = new Logger(PaymentsService.name);

    constructor(
        private prisma: PrismaService,
        private eventsGateway: EventsGateway,
        private mailService: MailService,
    ) { }

    async processWebhook(data: any): Promise<{ success: boolean; message: string }> {
        this.logger.log(`Received Webhook from SePay: ${JSON.stringify(data)}`);

        // Typical SePay webhook payload has: id, transferAmount, content, gateway, referenceCode, transactionDate
        const sepayId = Number(data.id);
        const amount = Number(data.transferAmount);
        const content = data.content as string;
        const bankBrandName = data.gateway || data.bankBrandName;
        const referenceNumber = data.referenceCode;

        if (!sepayId || !amount || !content) {
            this.logger.warn('Invalid Webhook payload structure.');
            return { success: false, message: 'Invalid payload' };
        }

        // 1. Extract Reference from content
        // Pattern: "FIGI 1234" (Legacy) or "FIGI PAY-123456" (Group)
        const regex = /FIGI\s*([A-Za-z0-9\-]+)/i;
        const match = content.match(regex);

        if (!match) {
            this.logger.warn(`Could not extract Reference from content: ${content}`);
            return { success: false, message: 'Reference not found in content' };
        }

        const extractedRef = match[1];
        const isGroupRef = extractedRef.toUpperCase().startsWith('PAY');
        const isTopUpRef = extractedRef.toUpperCase().startsWith('TU');

        try {
            return await this.prisma.$transaction(async (tx) => {
                // 2. Prevent Duplicate Processing (Shared across all types)
                const existingTx = await tx.payment_transactions.findUnique({
                    where: { sepay_id: sepayId },
                });

                if (existingTx) {
                    this.logger.log(`Transaction ${sepayId} already processed.`);
                    return { success: true, message: 'Already processed' };
                }

                // ----------------------------------------------------
                // TOP UP FLOW
                // ----------------------------------------------------
                if (isTopUpRef) {
                    // Ref format: TU[userId]V[timestamp]
                    const parts = extractedRef.toUpperCase().split('V');
                    if (parts.length < 2) {
                        return { success: false, message: 'Invalid Top-Up reference format' };
                    }

                    // parts[0] is like "TU5"
                    const userIdString = parts[0].replace('TU', '');
                    const userId = parseInt(userIdString, 10);

                    if (isNaN(userId)) {
                        return { success: false, message: 'Invalid User ID in Top-Up reference' };
                    }

                    // Log the processed webhook ID so we don't process it again
                    // (Top-ups don't have an order_id, so we use sepay_id as reference_number in wallet_transactions
                    // and also create a dummy payment_transaction record linked to a system or existing user order just to mark it done?
                    // Wait, payment_transactions REQUIRES order_id. This is a schema constraint.
                    // Let's check schema.prisma: `order_id Int`.
                    // To avoid schema migration, we MUST NOT use `payment_transactions` for Top-Ups if we don't have an order_id.
                    // Actually, if we use `wallet_transactions`, how do we prevent duplicates?
                    // We can check `wallet_transactions` where `reference_code == sepayId.toString()`!

                    const existingWalletTx = await tx.wallet_transactions.findFirst({
                        where: { reference_code: sepayId.toString() }
                    });

                    if (existingWalletTx) {
                        this.logger.log(`Top-Up Transaction ${sepayId} already processed.`);
                        return { success: true, message: 'Already processed' };
                    }

                    // Ensure wallet exists
                    let wallet = await tx.wallets.findUnique({ where: { user_id: userId } });
                    if (!wallet) {
                        wallet = await tx.wallets.create({
                            data: { user_id: userId, balance_available: 0, balance_locked: 0 }
                        });
                    }

                    // Add funds
                    await tx.wallets.update({
                        where: { wallet_id: wallet.wallet_id },
                        data: { balance_available: { increment: amount } }
                    });

                    // Record transaction
                    await tx.wallet_transactions.create({
                        data: {
                            wallet_id: wallet.wallet_id,
                            type_code: 'TOP_UP',
                            amount: amount,
                            reference_code: sepayId.toString(), // Use Sepay ID as unique ref against duplicates
                            description: `Top up via VietQR (${bankBrandName}) - Ref: ${extractedRef}`
                        }
                    });

                    this.logger.log(`Wallet Top-Up successful for User ID ${userId}. Amount: ${amount}`);
                    this.eventsGateway.notifyPaymentSuccess(extractedRef);

                    return { success: true, message: 'Top-up processed successfully' };
                }

                // ----------------------------------------------------
                // REGULAR ORDER FLOW
                // ----------------------------------------------------

                // 3. Find Orders
                let orders: any[] = [];
                if (isGroupRef) {
                    orders = await tx.orders.findMany({
                        where: { payment_ref_code: extractedRef },
                    });
                } else {
                    const orderId = parseInt(extractedRef);
                    if (!isNaN(orderId)) {
                        const order = await tx.orders.findUnique({ where: { order_id: orderId } });
                        if (order) orders = [order];
                    }
                }

                if (orders.length === 0) {
                    this.logger.warn(`Order(s) for ref ${extractedRef} not found for payment.`);
                    return { success: false, message: 'Order not found' };
                }

                // 4. Save Transaction Record using the first order_id to satisfy schema requirement
                const representativeOrderId = orders[0].order_id;
                await tx.payment_transactions.create({
                    data: {
                        sepay_id: sepayId,
                        order_id: representativeOrderId,
                        amount: amount,
                        transaction_content: content,
                        reference_number: referenceNumber,
                        bank_brand_name: bankBrandName,
                        account_number: data.accountNumber,
                        transaction_date: data.transactionDate ? new Date(data.transactionDate) : new Date(),
                    },
                });

                // 5. Update All Pending Orders in Group
                for (const order of orders) {
                    const validStatuses = ['PENDING_PAYMENT', 'WAITING_DEPOSIT', 'PENDING_FINAL_PAYMENT'];
                    if (validStatuses.includes(order.status_code || '')) {
                        const newStatus = order.status_code === 'WAITING_DEPOSIT' ? 'DEPOSITED' : 'PROCESSING';

                        await tx.orders.update({
                            where: { order_id: order.order_id },
                            data: {
                                status_code: newStatus,
                                payment_method_code: 'VIETQR',
                                payment_ref_code: isGroupRef ? extractedRef : sepayId.toString(),
                                paid_amount: order.total_amount // Mark as fully paid/deposited
                            },
                        });

                        await tx.order_status_history.create({
                            data: {
                                order_id: order.order_id,
                                previous_status: order.status_code,
                                new_status: newStatus,
                                note: `Paid via VietQR. Group Ref: ${extractedRef}`,
                            }
                        });

                        // If Pre-order, update the associated contract
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
                        } else if (order.status_code === 'PENDING_FINAL_PAYMENT' && newStatus === 'PROCESSING') {
                            const contract = await tx.preorder_contracts.findFirst({
                                where: { final_payment_order_id: order.order_id }
                            });

                            if (contract) {
                                await tx.preorder_contracts.update({
                                    where: { contract_id: contract.contract_id },
                                    data: { status_code: 'COMPLETED' }
                                });
                            }
                        }

                        this.logger.log(`Order ${order.order_id} successfully marked as ${newStatus}.`);

                        // --- NEW: Trigger Email & Admin Notifications ---
                        if (newStatus === 'PROCESSING' || newStatus === 'DEPOSITED') {
                            const fullOrder = await tx.orders.findUnique({
                                where: { order_id: order.order_id },
                                include: {
                                    users: true,
                                    order_items: { include: { product_variants: { include: { products: true } } } }
                                }
                            });

                            if (fullOrder && fullOrder.users) {
                                this.mailService.sendOrderConfirmation(fullOrder.users, fullOrder).catch(e => this.logger.error("Mail Error", e));
                                this.eventsGateway.notifyNewOrder(fullOrder); // Notify Warehouse/Admin
                            }
                        }
                    }
                }

                // Emit Socket event to trigger frontend redirect
                this.eventsGateway.notifyPaymentSuccess(representativeOrderId);
                if (isGroupRef) {
                    this.eventsGateway.notifyPaymentSuccess(extractedRef);
                }

                return { success: true, message: 'Webhook processed successfully' };
            });
        } catch (error) {
            this.logger.error(`Error processing webhook: ${error}`);
            // Return true even on error so SePay doesn't keep retrying if it's a structural error, 
            // but in real world, might want to return 500 for retry.
            return { success: false, message: 'Internal error' };
        }
    }
}
