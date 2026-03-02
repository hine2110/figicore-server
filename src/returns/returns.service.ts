import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { InspectReturnDto, InspectionResult } from './dto/inspect-return.dto';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class ReturnsService {
    constructor(
        private prisma: PrismaService,
        private walletService: WalletService,
        private eventsGateway: EventsGateway
    ) { }

    // 1. Customer Requests Return
    async createRequest(userId: number, dto: CreateReturnDto) {
        // Find order and verify ownership/status
        const order = await this.prisma.orders.findUnique({
            where: { order_id: dto.order_id },
            include: { order_items: true }
        });

        if (!order || order.user_id !== userId) {
            throw new NotFoundException('Order not found or access denied');
        }

        const validStatuses = ['COMPLETED', 'DELIVERED'];
        if (!validStatuses.includes(order.status_code || '')) {
            throw new BadRequestException('Order is not eligible for return (must be Delivered/Completed)');
        }

        // Check 72-hour window rule
        const updatedAt = order.updated_at ? new Date(order.updated_at).getTime() : Date.now();
        const hoursSinceUpdate = (Date.now() - updatedAt) / (1000 * 60 * 60);

        if (hoursSinceUpdate > 72) {
            throw new BadRequestException('The 72-hour return window for this order has expired.');
        }

        // Validate items
        for (const reqItem of dto.items) {
            const originalItem = order.order_items.find(oi => oi.item_id === reqItem.order_item_id);
            if (!originalItem) {
                throw new BadRequestException(`Order item ${reqItem.order_item_id} not found in this order`);
            }
            if (reqItem.quantity > originalItem.quantity) {
                throw new BadRequestException(`Cannot return ${reqItem.quantity} of item ${reqItem.order_item_id}. Max allowed: ${originalItem.quantity}`);
            }
        }

        // Create Return Request inside Transaction
        return this.prisma.$transaction(async (tx) => {
            const returnRequest = await tx.return_requests.create({
                data: {
                    user_id: userId,
                    order_id: dto.order_id,
                    reason: dto.reason,
                    unbox_video_url: dto.unbox_video_url,
                    defect_image_urls: dto.defect_image_urls,
                    status_code: 'PENDING'
                }
            });

            // Create Return Items
            const returnItemsData = dto.items.map(item => ({
                return_id: returnRequest.return_id,
                order_item_id: item.order_item_id,
                quantity: item.quantity
            }));

            await tx.return_items.createMany({
                data: returnItemsData
            });

            // Update order status so it can't be returned again easily immediately
            await tx.orders.update({
                where: { order_id: dto.order_id },
                data: { status_code: 'RETURNING' }
            });

            this.eventsGateway.notifyNewReturnRequest(returnRequest);

            return returnRequest;
        });
    }

    // 2. Manager Approves/Rejects Return
    async updateStatus(returnId: number, status: 'SHIPPING_TO_WAREHOUSE' | 'REJECTED', adminNote?: string) {
        const returnReq = await this.prisma.return_requests.findUnique({ where: { return_id: returnId } });
        if (!returnReq) throw new NotFoundException('Return request not found');

        if (returnReq.status_code !== 'PENDING') {
            throw new BadRequestException(`Cannot update status from ${returnReq.status_code}`);
        }

        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.return_requests.update({
                where: { return_id: returnId },
                data: { status_code: status, admin_note: adminNote }
            });

            if (status === 'REJECTED') {
                await tx.orders.update({
                    where: { order_id: returnReq.order_id },
                    data: { status_code: 'COMPLETED' } // revert order status
                });

                const title = `Return Request Rejected`;
                const content = `Your return request #${returnId} has been rejected.\nReason: ${adminNote || 'Does not meet return policy requirements'}`;
                await tx.notifications.create({
                    data: { user_id: returnReq.user_id, title, content }
                });
                this.eventsGateway.notifyCustomer(returnReq.user_id, title, content);
            } else if (status === 'SHIPPING_TO_WAREHOUSE') {
                const title = `Return Request Approved`;
                const content = `Your return request #${returnId} has been approved. Please pack the products carefully, a shipper will contact you for pickup within 24 hours.\n${adminNote ? `Shop Note: ${adminNote}` : ''}`;
                await tx.notifications.create({
                    data: { user_id: returnReq.user_id, title, content }
                });
                this.eventsGateway.notifyCustomer(returnReq.user_id, title, content);
            }

            return updated;
        });
    }

    // 3. Simulate Shipping
    async receiveAtWarehouse(returnId: number) {
        const returnReq = await this.prisma.return_requests.findUnique({ where: { return_id: returnId } });
        if (!returnReq || returnReq.status_code !== 'SHIPPING_TO_WAREHOUSE') {
            throw new BadRequestException('Return request is not in shipping state');
        }

        return this.prisma.return_requests.update({
            where: { return_id: returnId },
            data: { status_code: 'INSPECTING' }
        });
    }

    // 4. Warehouse Manual Inspection & Wallet Refund
    async inspectReturn(returnId: number, dto: InspectReturnDto) {
        const returnReq = await this.prisma.return_requests.findUnique({
            where: { return_id: returnId },
            include: {
                return_items: {
                    include: {
                        order_items: true // We need this to get the price of the item
                    }
                }
            }
        });

        if (!returnReq || returnReq.status_code !== 'INSPECTING') {
            throw new BadRequestException('Return request is not ready for inspection');
        }

        return this.prisma.$transaction(async (tx) => {
            let totalRefundAmount = 0;

            for (const inspectedItem of dto.items) {
                // Find corresponding return item from DB
                const dbReturnItem = returnReq.return_items.find(ri => ri.return_item_id === inspectedItem.return_item_id);
                if (!dbReturnItem) {
                    throw new BadRequestException(`Invalid return_item_id: ${inspectedItem.return_item_id}`);
                }

                // Identify the exact variant to adjust stock
                const variantId = dbReturnItem.order_items.allocated_product_id || dbReturnItem.order_items.variant_id;
                const quantityReturned = dbReturnItem.quantity;

                // Adjust Stock based on Inspection Result
                if (inspectedItem.result === InspectionResult.RESTOCK) {
                    await tx.product_variants.update({
                        where: { variant_id: variantId },
                        data: { stock_available: { increment: quantityReturned } }
                    });
                } else if (inspectedItem.result === InspectionResult.BOX_DAMAGE) {
                    await tx.product_variants.update({
                        where: { variant_id: variantId },
                        data: { stock_defect: { increment: quantityReturned } }
                    });
                } else if (inspectedItem.result === InspectionResult.FACTORY_DEFECT) {
                    await tx.product_variants.update({
                        where: { variant_id: variantId },
                        data: { stock_factory_defect: { increment: quantityReturned } }
                    });
                } else if (inspectedItem.result === InspectionResult.FRAUD) {
                    // Do nothing to stock.
                }

                // Calculate Refund Amount
                // If it's FRAUD, user gets $0 back for this specific item.
                if (inspectedItem.result !== InspectionResult.FRAUD) {
                    // Calculate based on unit_price * quantity returned
                    const itemUnitPrice = Number(dbReturnItem.order_items.unit_price);
                    totalRefundAmount += (itemUnitPrice * quantityReturned);
                }
            }

            // Mark Return Request as Completed
            const completedRequest = await tx.return_requests.update({
                where: { return_id: returnId },
                data: { status_code: 'COMPLETED' }
            });

            // Revert Order Status completely
            await tx.orders.update({
                where: { order_id: returnReq.order_id },
                data: { status_code: 'RETURNED' }
            });

            // Notification Flags
            const hasFraud = dto.items.some(i => i.result === InspectionResult.FRAUD);
            const hasValidReturn = dto.items.some(i => i.result !== InspectionResult.FRAUD);

            if (hasFraud) {
                const title = `⚠️ ACCOUNT VIOLATION WARNING`;
                const content = `We have detected fraudulent activity or the return of invalid items/trash in return request #${returnId}. Refunds have been denied for the violating products. Any further violations will result in your account being PERMANENTLY BANNED.`;
                await tx.notifications.create({ data: { user_id: returnReq.user_id, title, content } });
                this.eventsGateway.notifyCustomer(returnReq.user_id, title, content);
            }

            // Automatically Top Up Wallet if not fraud
            if (totalRefundAmount > 0 && hasValidReturn) {
                // Find or create wallet inside transaction
                let wallet = await tx.wallets.findUnique({ where: { user_id: returnReq.user_id } });
                if (!wallet) {
                    wallet = await tx.wallets.create({
                        data: { user_id: returnReq.user_id, balance_available: 0, balance_locked: 0 }
                    });
                }

                await tx.wallets.update({
                    where: { wallet_id: wallet.wallet_id },
                    data: { balance_available: { increment: totalRefundAmount } }
                });

                await tx.wallet_transactions.create({
                    data: {
                        wallet_id: wallet.wallet_id,
                        type_code: 'REFUND',
                        amount: totalRefundAmount,
                        reference_code: `RETURN-${returnReq.return_id}`,
                        description: `Refund for returned items in order #${returnReq.order_id}`
                    }
                });

                const title = `Refund Successful 💸`;
                const content = `Inspection completed successfully for request #${returnId}. An amount of ${totalRefundAmount.toLocaleString('vi-VN')} VNĐ has been credited to your Wallet. Figicore sincerely apologizes for this unexpected shopping experience!`;
                await tx.notifications.create({ data: { user_id: returnReq.user_id, title, content } });
                this.eventsGateway.notifyCustomer(returnReq.user_id, title, content);
            }

            return {
                success: true,
                message: 'Inspection completed',
                refunded_amount: totalRefundAmount,
                return_request: completedRequest
            };
        });
    }

    // List all
    async getAllReturns() {
        return this.prisma.return_requests.findMany({
            include: {
                users: { select: { full_name: true, email: true } },
                orders: { select: { order_code: true, status_code: true } },
                return_items: {
                    include: {
                        order_items: {
                            include: {
                                product_variants: { include: { products: true } }
                            }
                        }
                    }
                }
            },
            orderBy: { created_at: 'desc' }
        });
    }

    // List user specific
    async getMyReturns(userId: number) {
        return this.prisma.return_requests.findMany({
            where: { user_id: userId },
            include: {
                orders: { select: { order_code: true } },
                return_items: {
                    include: {
                        order_items: {
                            include: {
                                product_variants: { include: { products: true } }
                            }
                        }
                    }
                }
            },
            orderBy: { created_at: 'desc' }
        });
    }
}
