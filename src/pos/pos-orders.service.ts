
import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePosOrderDto } from './dto/create-pos-order.dto';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { SyncPosOrderDto } from './dto/sync-pos-order.dto';
import { GetPosOrdersDto } from './dto/get-pos-orders.dto';
import * as bcrypt from 'bcrypt';

import { CustomersService } from '../customers/customers.service';

@Injectable()
export class PosOrdersService {
    constructor(
        private prisma: PrismaService,
        private customersService: CustomersService
    ) { }

    /**
     * Tạo đơn hàng POS (Finalize)
     */
    async createOrder(staffId: number, dto: CreatePosOrderDto) {
        // 1. Validate session đang mở
        const activeSession = await this.prisma.pos_sessions.findFirst({
            where: {
                user_id: staffId,
                status_code: 'OPEN',
                deleted_at: null,
            },
        });

        if (!activeSession) {
            throw new BadRequestException('Không có ca làm việc đang mở. Vui lòng mở ca trước khi tạo đơn.');
        }

        // 2. Validate và lấy thông tin variants
        const variantIds = dto.items.map(item => item.variant_id);
        const variants = await this.prisma.product_variants.findMany({
            where: {
                variant_id: { in: variantIds },
                deleted_at: null,
            },
            include: { products: true },
        });

        // 3. Tính toán tổng tiền và thuế
        let totalAmount = 0;
        const orderItems = dto.items.map(item => {
            const variant = variants.find(v => v.variant_id === item.variant_id);
            if (!variant) throw new BadRequestException('Sản phẩm không tồn tại');

            const unitPrice = Number(variant.price);
            const totalPrice = unitPrice * item.quantity;
            return {
                variant_id: variant.variant_id,
                quantity: item.quantity,
                unit_price: unitPrice,
                total_price: totalPrice,
            };
        });

        const discountAmount = dto.discount_amount || 0;
        const finalAmount = totalAmount - discountAmount;
        const orderCode = this.generateOrderCode();

        // 4. Transaction: Tạo đơn + Finalize Sync
        const order = await this.prisma.$transaction(async (tx) => {
            // Kiểm tra xem có đơn hàng PENDING nào đang sync không
            let existingOrder = await tx.orders.findFirst({
                where: {
                    session_id: activeSession.session_id,
                    created_by_staff_id: staffId,
                    status_code: 'PENDING',
                    channel_code: 'POS',
                    deleted_at: null
                },
                include: { order_items: true }
            });

            let newOrder;
            if (existingOrder) {
                // Finalize existing pending order
                newOrder = await (tx.orders as any).update({
                    where: { order_id: existingOrder.order_id },
                    data: {
                        user_id: dto.user_id || null,
                        payment_method_code: dto.payment_method_code,
                        total_amount: finalAmount,
                        paid_amount: finalAmount,
                        discount_amount: discountAmount,
                        cash_received: dto.cash_received || null,
                        cash_change: dto.cash_change || null,
                        status_code: 'COMPLETED',
                        note: dto.note,
                        updated_at: new Date(),
                    } as any,
                });
            } else {
                // Tạo mới hoàn toàn (Trường hợp skip sync)
                newOrder = await (tx.orders as any).create({
                    data: {
                        order_code: orderCode,
                        user_id: dto.user_id || null,
                        session_id: activeSession.session_id,
                        created_by_staff_id: staffId,
                        channel_code: 'POS',
                        payment_method_code: dto.payment_method_code,
                        total_amount: finalAmount,
                        paid_amount: finalAmount,
                        discount_amount: discountAmount,
                        shipping_fee: 0,
                        status_code: 'COMPLETED',
                        note: dto.note,
                    } as any,
                });

                for (const item of orderItems) {
                    await tx.order_items.create({
                        data: {
                            order_id: newOrder.order_id,
                            variant_id: item.variant_id,
                            quantity: item.quantity,
                            unit_price: item.unit_price,
                            total_price: item.total_price,
                        },
                    });

                    await tx.product_variants.update({
                        where: { variant_id: item.variant_id },
                        data: { stock_available: { decrement: item.quantity } },
                    });
                }
            }

            return newOrder;
        });

        // 5. Cập nhật hạng thành viên & Điểm tích lũy
        if (dto.user_id) {
            try {
                // Chúng ta gọi update trước khi trả về kết quả cuối cùng để lấy được data mới nhất
                await this.customersService.updateCustomerStats(dto.user_id, Number(finalAmount));
            } catch (e) {
                console.error('Failed to update customer stats', e);
            }
        }

        // 6. Lấy lại đơn hàng kèm thông tin User/Customer mới nhất
        const finalOrder = await this.prisma.orders.findUnique({
            where: { order_id: order.order_id },
            include: {
                order_items: {
                    include: {
                        product_variants: { include: { products: true } },
                    },
                },
                users: {
                    include: {
                        customers: true
                    }
                },
                employees: {
                    include: {
                        users: {
                            select: { full_name: true }
                        }
                    }
                }
            },
        });

        return { success: true, message: 'Tạo đơn hàng thành công', data: finalOrder };
    }

    private generateOrderCode(): string {
        const date = new Date();
        const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        return `POS-${dateStr}-${random}`;
    }

    async cancelOrder(staffId: number, orderId: number) {
        return this.prisma.$transaction(async (tx) => {
            const order = await tx.orders.findUnique({
                where: { order_id: orderId },
                include: { order_items: true },
            });

            if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
            if (order.status_code === 'CANCELLED') return { success: true, message: 'Đã hủy' };

            // Trả kho
            for (const item of order.order_items) {
                await tx.product_variants.update({
                    where: { variant_id: item.variant_id },
                    data: { stock_available: { increment: item.quantity } },
                });
            }

            const updatedOrder = await tx.orders.update({
                where: { order_id: orderId },
                data: { status_code: 'CANCELLED', updated_at: new Date() },
            });

            return { success: true, message: 'Hủy đơn hàng thành công', data: updatedOrder };
        });
    }

    async getOrderById(staffId: number, orderId: number) {
        const order = await this.prisma.orders.findUnique({
            where: { order_id: orderId },
            include: {
                order_items: {
                    include: {
                        product_variants: { include: { products: true } },
                    },
                },
                users: {
                    include: {
                        customers: true
                    }
                },
                employees: {
                    include: {
                        users: {
                            select: { full_name: true }
                        }
                    }
                }
            },
        });

        if (!order) {
            throw new NotFoundException('Không tìm thấy đơn hàng');
        }

        return { success: true, message: 'Lấy chi tiết đơn hàng thành công', data: order };
    }

    async getOrdersByStaff(staffId: number, query: GetPosOrdersDto) {
        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 12;

        const where: any = {
            created_by_staff_id: staffId,
            channel_code: 'POS',
            deleted_at: null,
            status_code: query.status && query.status !== 'ALL' ? query.status : { not: 'PENDING' }
        };

        // Lọc theo phương thức thanh toán
        if (query.payment_method && query.payment_method !== 'ALL') {
            where.payment_method_code = query.payment_method;
        }

        // Lọc theo ngày đơn lẻ (date)
        if (query.date) {
            const date = new Date(query.date);
            const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
            const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
            where.created_at = {
                gte: startOfDay,
                lte: endOfDay
            };
        }

        // Sorting
        const orderBy: any = {};
        if (query.sort_by) {
            orderBy[query.sort_by] = query.sort_order || 'desc';
        } else {
            orderBy.created_at = 'desc';
        }

        const [orders, total, aggregate] = await Promise.all([
            this.prisma.orders.findMany({
                where,
                include: {
                    order_items: { include: { product_variants: { include: { products: true } } } },
                    users: true,
                    employees: { include: { users: true } }
                },
                orderBy,
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.orders.count({ where }),
            this.prisma.orders.aggregate({
                where,
                _sum: { total_amount: true }
            })
        ]);

        return {
            success: true,
            count: orders.length,
            data: orders,
            total,
            page,
            limit,
            total_revenue: Number(aggregate._sum.total_amount || 0)
        };
    }

    async searchCustomer(query: { phone?: string; email?: string; q?: string; page?: number; limit?: number }) {
        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 15;
        const { phone, email, q } = query;
        const where: any = { deleted_at: null, role_code: 'CUSTOMER' };

        if (phone) where.phone = { contains: phone };
        else if (email) where.email = { contains: email, mode: 'insensitive' };
        else if (q) {
            where.OR = [
                { phone: { contains: q } },
                { email: { contains: q, mode: 'insensitive' } },
                { full_name: { contains: q, mode: 'insensitive' } },
            ];
        }

        const [customers, total] = await Promise.all([
            this.prisma.users.findMany({
                where,
                include: { customers: true, wallets: true, _count: { select: { orders: true } } },
                orderBy: { created_at: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.users.count({ where })
        ]);

        const formatted = customers.map(c => ({
            ...c,
            loyalty_points: c.customers?.loyalty_points || 0,
            rank_code: c.customers?.current_rank_code || 'BRONZE',
            total_spent: c.customers?.total_spent || 0,
            wallet_balance: Number(c.wallets?.balance_available || 0),
            total_orders: c._count.orders,
            _count: undefined
        }));

        return { success: true, count: formatted.length, data: formatted, total, page, limit };
    }

    async getCustomerOrderHistory(customerId: number, staffId: number) {
        const customer = await this.prisma.users.findUnique({
            where: { user_id: customerId, deleted_at: null },
            include: { customers: true, wallets: true }
        });

        if (!customer) throw new NotFoundException('Khách hàng không tồn tại');

        const orders = await this.prisma.orders.findMany({
            where: { user_id: customerId, deleted_at: null, channel_code: 'POS', status_code: { not: 'PENDING' } },
            include: {
                order_items: { include: { product_variants: { include: { products: true } } } },
                users: true,
                employees: { include: { users: true } }
            },
            orderBy: { created_at: 'desc' },
            take: 50
        });

        // Calculate Statistics
        const completedOrders = orders.filter(o => o.status_code === 'COMPLETED');
        const totalSpent = completedOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);
        const totalOrders = completedOrders.length;
        const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;

        // Calculate Top Products (Favorites)
        const productStats = new Map<number, { product_name: string, quantity: number, total_spent: number }>();
        orders.forEach(order => {
            order.order_items.forEach(item => {
                const variant = item.product_variants;
                if (!variant) return;
                const productId = variant.product_id;
                const current = productStats.get(productId) || {
                    product_name: variant.products.name,
                    quantity: 0,
                    total_spent: 0
                };
                current.quantity += item.quantity;
                current.total_spent += Number(item.total_price);
                productStats.set(productId, current);
            });
        });

        const topProducts = Array.from(productStats.values())
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 5);

        // Flatten customer object for frontend
        const formattedCustomer = {
            ...customer,
            loyalty_points: customer.customers?.loyalty_points || 0,
            rank_code: customer.customers?.current_rank_code || 'BRONZE',
            total_spent: customer.customers?.total_spent || 0,
            wallet_balance: Number(customer.wallets?.balance_available || 0),
            address: '', // Placeholder
        };

        return {
            success: true,
            data: {
                customer: formattedCustomer,
                orders,
                statistics: {
                    total_spent: totalSpent,
                    total_orders: totalOrders,
                    avg_order_value: avgOrderValue
                },
                top_products: topProducts
            }
        };
    }

    async registerCustomer(dto: RegisterCustomerDto) {
        // 1. Check if user exists
        let user = await this.prisma.users.findFirst({
            where: { phone: dto.phone, deleted_at: null },
            include: { customers: true }
        });

        if (user) {
            // IF GUEST_POS and we have a new better name, update it
            if (user.status_code === 'GUEST_POS' && dto.full_name && dto.full_name !== 'Khách POS') {
                user = await this.prisma.users.update({
                    where: { user_id: user.user_id },
                    data: { full_name: dto.full_name },
                    include: { customers: true }
                });
            }
            return { success: true, message: 'Khách hàng đã tồn tại.', data: user };
        }

        // 2. Create new GUEST_POS user
        const newUser = await this.prisma.users.create({
            data: {
                email: dto.email || null,
                password_hash: null,
                full_name: dto.full_name || 'Khách POS',
                phone: dto.phone,
                role_code: 'CUSTOMER',
                status_code: 'GUEST_POS',
                is_verified: false
            }
        });

        const profile = await this.prisma.customers.create({
            data: { user_id: newUser.user_id, current_rank_code: 'BRONZE' }
        });

        return {
            success: true,
            message: 'Đăng ký khách hàng mới thành công.',
            data: { ...newUser, customers: profile }
        };
    }

    async getActiveOrder(staffId: number) {
        const activeSession = await this.prisma.pos_sessions.findFirst({
            where: { user_id: staffId, status_code: 'OPEN', deleted_at: null },
            orderBy: { opened_at: 'desc' }
        });
        if (!activeSession) return null;

        return this.prisma.orders.findFirst({
            where: { session_id: activeSession.session_id, created_by_staff_id: staffId, status_code: 'PENDING', channel_code: 'POS', deleted_at: null },
            include: { order_items: { include: { product_variants: { include: { products: true } } } }, users: true }
        });
    }

    async syncActiveOrder(staffId: number, dto: SyncPosOrderDto) {
        const activeSession = await this.prisma.pos_sessions.findFirst({
            where: { user_id: staffId, status_code: 'OPEN', deleted_at: null },
            orderBy: { opened_at: 'desc' }
        });
        if (!activeSession) throw new BadRequestException('Session POS đóng');

        return await this.prisma.$transaction(async (tx) => {
            let order: any = await tx.orders.findFirst({
                where: { session_id: activeSession.session_id, created_by_staff_id: staffId, status_code: 'PENDING', channel_code: 'POS', deleted_at: null },
                include: { order_items: true }
            });

            if (!order && dto.items.length === 0) return null;

            if (order && dto.items.length === 0) {
                for (const item of order.order_items) {
                    await tx.product_variants.update({ where: { variant_id: item.variant_id }, data: { stock_available: { increment: item.quantity } } });
                }
                await tx.order_items.deleteMany({ where: { order_id: order.order_id } });
                await tx.orders.deleteMany({ where: { order_id: order.order_id } });
                return null;
            }

            if (!order) {
                order = await (tx.orders as any).create({
                    data: {
                        order_code: this.generateOrderCode(),
                        session_id: activeSession.session_id,
                        created_by_staff_id: staffId,
                        user_id: dto.user_id || null,
                        channel_code: 'POS',
                        total_amount: 0,
                        status_code: 'PENDING',
                        note: dto.note,
                    } as any,
                    include: { order_items: true }
                });
            } else {
                await (tx.orders as any).update({
                    where: { order_id: order.order_id },
                    data: {
                        user_id: dto.user_id || null,
                        note: dto.note,
                    } as any
                });
            }

            if (!order) return null;

            const currentMap = new Map(dto.items.map(i => [i.variant_id, i.quantity]));
            const dbMap = new Map((order.order_items as any[]).map(i => [i.variant_id, i.quantity]));

            for (const [vId, nQty] of currentMap) {
                const oQty = dbMap.get(vId) || 0;
                const delta = nQty - oQty;
                if (delta === 0) continue;

                await tx.product_variants.update({ where: { variant_id: vId }, data: { stock_available: { decrement: delta } } });
                const variant = await tx.product_variants.findUnique({ where: { variant_id: vId } });
                if (!variant) throw new BadRequestException(`Variant ${vId} not found`);

                const price = Number(variant.price);

                if (oQty > 0) {
                    await tx.order_items.updateMany({
                        where: { order_id: order.order_id, variant_id: vId },
                        data: {
                            quantity: nQty,
                            total_price: price * nQty,
                        }
                    });
                } else {
                    await tx.order_items.create({
                        data: {
                            order_id: order.order_id,
                            variant_id: vId,
                            quantity: nQty,
                            unit_price: price,
                            total_price: price * nQty,
                        }
                    });
                }
            }

            for (const item of order.order_items) {
                if (!currentMap.has(item.variant_id)) {
                    await tx.product_variants.update({ where: { variant_id: item.variant_id }, data: { stock_available: { increment: item.quantity } } });
                    await tx.order_items.delete({ where: { item_id: item.item_id } });
                }
            }

            const finalItems = await tx.order_items.findMany({ where: { order_id: order.order_id } });
            const total = finalItems.reduce((sum, i) => sum + Number(i.total_price), 0);
            const discount = dto.discount_amount || 0;

            return tx.orders.update({
                where: { order_id: order.order_id },
                data: {
                    total_amount: total - discount,
                    discount_amount: discount
                },
                include: { order_items: true }
            });
        });
    }

    /**
     * Tạo đơn hàng POS chờ thanh toán QR (PENDING_PAYMENT)
     * Chỉ tạo đơn với trạng thái PENDING_PAYMENT, chưa COMPLETED.
     * Đơn sẽ được chuyển sang COMPLETED sau khi webhook SePay xác nhận.
     */
    async createPendingQrOrder(staffId: number, dto: CreatePosOrderDto) {
        const activeSession = await this.prisma.pos_sessions.findFirst({
            where: { user_id: staffId, status_code: 'OPEN', deleted_at: null },
        });

        if (!activeSession) {
            throw new BadRequestException('Không có ca làm việc đang mở. Vui lòng mở ca trước khi tạo đơn.');
        }

        const variantIds = dto.items.map(item => item.variant_id);
        const variants = await this.prisma.product_variants.findMany({
            where: { variant_id: { in: variantIds }, deleted_at: null },
            include: { products: true },
        });

        let totalAmount = 0;
        const orderItems = dto.items.map(item => {
            const variant = variants.find(v => v.variant_id === item.variant_id);
            if (!variant) throw new BadRequestException('Sản phẩm không tồn tại');
            const unitPrice = Number(variant.price);
            const totalPrice = unitPrice * item.quantity;
            totalAmount += totalPrice;
            return { variant_id: variant.variant_id, quantity: item.quantity, unit_price: unitPrice, total_price: totalPrice };
        });

        const discountAmount = dto.discount_amount || 0;
        const finalAmount = totalAmount - discountAmount;
        const paymentRefCode = this.generatePosQrRef();
        const orderCode = this.generateOrderCode();

        const order = await this.prisma.$transaction(async (tx) => {
            // 1. Kiểm tra đơn hàng PENDING từ sync (nếu có)
            const existingPending = await tx.orders.findFirst({
                where: {
                    session_id: activeSession.session_id,
                    created_by_staff_id: staffId,
                    status_code: 'PENDING',
                    channel_code: 'POS',
                    deleted_at: null
                },
                include: { order_items: true }
            });

            // 2. Hủy đơn PENDING QR cũ (nếu có - trường hợp nhấn nút thanh toán QR nhiều lần)
            const oldPendingQr = await tx.orders.findFirst({
                where: {
                    session_id: activeSession.session_id,
                    created_by_staff_id: staffId,
                    status_code: 'PENDING_PAYMENT',
                    channel_code: 'POS',
                    deleted_at: null
                },
                include: { order_items: true }
            });

            if (oldPendingQr) {
                for (const item of oldPendingQr.order_items) {
                    await tx.product_variants.update({ where: { variant_id: item.variant_id }, data: { stock_available: { increment: item.quantity } } });
                }
                await tx.orders.update({ where: { order_id: oldPendingQr.order_id }, data: { status_code: 'CANCELLED', deleted_at: new Date() } });
            }

            let newOrder;
            if (existingPending) {
                // Tái sử dụng đơn PENDING từ sync: Cập nhật status và payment_ref
                newOrder = await (tx.orders as any).update({
                    where: { order_id: existingPending.order_id },
                    data: {
                        user_id: dto.user_id || null,
                        payment_method_code: 'VIETQR',
                        payment_ref_code: paymentRefCode,
                        total_amount: finalAmount,
                        paid_amount: 0,
                        discount_amount: discountAmount,
                        status_code: 'PENDING_PAYMENT',
                        note: dto.note,
                        updated_at: new Date(),
                    } as any,
                });

                // Lưu ý: Stock đã được trừ trong quá trình sync rồi, không cần trừ lại.
            } else {
                // Tạo mới hoàn toàn (nếu skip sync)
                newOrder = await (tx.orders as any).create({
                    data: {
                        order_code: orderCode,
                        user_id: dto.user_id || null,
                        session_id: activeSession.session_id,
                        created_by_staff_id: staffId,
                        channel_code: 'POS',
                        payment_method_code: 'VIETQR',
                        payment_ref_code: paymentRefCode,
                        total_amount: finalAmount,
                        paid_amount: 0,
                        discount_amount: discountAmount,
                        shipping_fee: 0,
                        status_code: 'PENDING_PAYMENT',
                        note: dto.note,
                    } as any,
                });

                for (const item of orderItems) {
                    await tx.order_items.create({
                        data: {
                            order_id: newOrder.order_id,
                            variant_id: item.variant_id,
                            quantity: item.quantity,
                            unit_price: item.unit_price,
                            total_price: item.total_price,
                        },
                    });
                    await tx.product_variants.update({
                        where: { variant_id: item.variant_id },
                        data: { stock_available: { decrement: item.quantity } },
                    });
                }
            }

            return newOrder;
        });

        const finalOrder = await this.prisma.orders.findUnique({
            where: { order_id: order.order_id },
            include: {
                order_items: { include: { product_variants: { include: { products: true } } } },
                users: { include: { customers: true } },
            },
        });

        return {
            success: true,
            message: 'Đơn hàng QR đã được tạo, đang chờ thanh toán.',
            data: { ...finalOrder, payment_ref_code: paymentRefCode },
        };
    }

    private generatePosQrRef(): string {
        const date = new Date();
        const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        return `POS-${dateStr}-${random}`;
    }
}
