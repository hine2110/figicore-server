import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePosOrderDto } from './dto/create-pos-order.dto';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import * as bcrypt from 'bcrypt';

import { CustomersService } from '../customers/customers.service';

@Injectable()
export class PosOrdersService {
    constructor(
        private prisma: PrismaService,
        private customersService: CustomersService
    ) { }

    /**
     * Tạo đơn hàng POS
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
            throw new BadRequestException(
                'Không có ca làm việc đang mở. Vui lòng mở ca trước khi tạo đơn.',
            );
        }

        // 2. Validate và lấy thông tin variants
        const variantIds = dto.items.map(item => item.variant_id);
        const variants = await this.prisma.product_variants.findMany({
            where: {
                variant_id: { in: variantIds },
                deleted_at: null,
            },
            include: {
                products: true,
            },
        });

        if (variants.length !== variantIds.length) {
            throw new BadRequestException('Một số sản phẩm không tồn tại');
        }

        // 3. Kiểm tra tồn kho
        for (const item of dto.items) {
            const variant = variants.find(v => v.variant_id === item.variant_id);
            if (!variant) continue;

            if (variant.stock_available < item.quantity) {
                throw new BadRequestException(
                    `Sản phẩm "${variant.products.name} - ${variant.option_name}" chỉ còn ${variant.stock_available} trong kho`,
                );
            }

            // Kiểm tra product phải ACTIVE
            if (variant.products.status_code !== 'ACTIVE') {
                throw new BadRequestException(
                    `Sản phẩm "${variant.products.name}" không còn hoạt động`,
                );
            }
        }

        // 4. Tính toán tổng tiền
        let totalAmount = 0;
        const orderItems = dto.items.map(item => {
            const variant = variants.find(v => v.variant_id === item.variant_id);
            if (!variant) {
                throw new BadRequestException('Variant not found');
            }

            const unitPrice = Number(variant.price);
            const quantity = item.quantity;
            const totalPrice = unitPrice * quantity;
            totalAmount += totalPrice;

            return {
                variant_id: variant.variant_id,
                quantity,
                unit_price: unitPrice,
                total_price: totalPrice,
            };
        });

        const discountAmount = dto.discount_amount || 0;
        const finalAmount = totalAmount - discountAmount;

        // 5. Tạo order code
        const orderCode = this.generateOrderCode();

        // 6. Transaction: Tạo đơn + Trừ kho
        const order = await this.prisma.$transaction(async (tx) => {
            // Tạo đơn hàng
            const newOrder = await tx.orders.create({
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
                    status_code: 'COMPLETED', // POS luôn COMPLETED ngay
                    note: dto.note,
                },
            });

            // Tạo order items
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
            }

            // Trừ kho
            for (const item of orderItems) {
                // Trừ stock_available
                await tx.product_variants.update({
                    where: { variant_id: item.variant_id },
                    data: {
                        stock_available: {
                            decrement: item.quantity,
                        },
                    },
                });

                // Note: Inventory tracking done via order_items
                // Stock changes are recorded through order history
            }

            // Lấy đơn hàng đầy đủ
            return tx.orders.findUnique({
                where: { order_id: newOrder.order_id },
                include: {
                    order_items: {
                        include: {
                            product_variants: {
                                include: {
                                    products: true,
                                },
                            },
                        },
                    },
                },
            });
        });

        // 7. Cập nhật hạng thành viên và điểm thưởng (nếu có khách hàng)
        if (dto.user_id) {
            try {
                await this.customersService.updateCustomerStats(dto.user_id, Number(finalAmount));
            } catch (error) {
                console.error('Failed to update customer stats:', error);
                // Fail silently, don't block order creation
            }
        }

        return {
            success: true,
            message: 'Tạo đơn hàng thành công',
            data: order,
        };
    }

    /**
     * Generate order code: POS-YYYYMMDD-XXXX
     */
    private generateOrderCode(): string {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');

        return `POS-${year}${month}${day}-${random}`;
    }

    /**
     * Lấy danh sách đơn hàng từ session hiện tại
     */
    async getOrdersByStaff(staffId: number) {
        // Lấy session đang mở (nếu có)
        const activeSession = await this.prisma.pos_sessions.findFirst({
            where: {
                user_id: staffId,
                status_code: 'OPEN',
                deleted_at: null,
            },
        });

        if (!activeSession) {
            // Không có session đang mở, trả về mảng rỗng
            return {
                success: true,
                count: 0,
                data: [],
            };
        }

        // Lấy tất cả orders của session này
        const orders = await this.prisma.orders.findMany({
            where: {
                session_id: activeSession.session_id,
                channel_code: 'POS',
                deleted_at: null,
            },
            include: {
                order_items: {
                    include: {
                        product_variants: {
                            include: {
                                products: true,
                            },
                        },
                    },
                },
                users: {
                    select: {
                        user_id: true,
                        full_name: true,
                        phone: true,
                        email: true,
                    },
                },
                employees: {
                    select: {
                        users: {
                            select: {
                                full_name: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                created_at: 'desc', // Mới nhất lên đầu
            },
        });

        return {
            success: true,
            count: orders.length,
            data: orders,
        };
    }

    /**
     * Tìm kiếm khách hàng (cho POS)
     */
    async searchCustomer(query: { phone?: string; email?: string; q?: string }) {
        const { phone, email, q } = query;

        // Build search conditions
        const where: any = {
            deleted_at: null,
            role_code: 'CUSTOMER', // Only search customers
        };

        if (phone) {
            where.phone = { contains: phone };
        } else if (email) {
            where.email = { contains: email, mode: 'insensitive' };
        } else if (q) {
            where.OR = [
                { phone: { contains: q } },
                { email: { contains: q, mode: 'insensitive' } },
                { full_name: { contains: q, mode: 'insensitive' } },
            ];
        }

        const customers = await this.prisma.users.findMany({
            where,
            select: {
                user_id: true,
                full_name: true,
                phone: true,
                email: true,
                customers: {
                    select: {
                        current_rank_code: true,
                        total_spent: true,
                        loyalty_points: true
                    }
                },
                _count: {
                    select: {
                        orders: true
                    }
                }
            },
            orderBy: {
                created_at: 'desc'
            },
            take: 20, // Limit results
        });

        const formattedCustomers = customers.map(customer => ({
            ...customer,
            total_orders: customer._count.orders,
            _count: undefined
        }));

        return {
            success: true,
            count: formattedCustomers.length,
            data: formattedCustomers,
        };
    }

    /**
     * Lấy lịch sử mua hàng của khách hàng
     */
    async getCustomerOrderHistory(customerId: number, staffId: number) {
        // 1. Lấy thông tin khách hàng
        const customer = await this.prisma.users.findUnique({
            where: { user_id: customerId, deleted_at: null },
            include: {
                customers: true  // Correct relation name from schema
            }
        });

        if (!customer) {
            throw new NotFoundException('Không tìm thấy khách hàng');
        }

        // 2. Lấy tất cả đơn hàng của khách (không giới hạn session)
        const orders = await this.prisma.orders.findMany({
            where: {
                user_id: customerId,
                deleted_at: null,
                channel_code: 'POS' // Chỉ lấy đơn POS
            },
            include: {
                order_items: {
                    include: {
                        product_variants: {
                            include: {
                                products: true  // Get products through product_variants
                            }
                        }
                    }
                },
                employees: {
                    select: {
                        users: {
                            select: {
                                full_name: true
                            }
                        }
                    }
                }
            },
            orderBy: { created_at: 'desc' },
            take: 50 // Giới hạn 50 đơn gần nhất để tránh quá tải
        });

        // 3. Tính thống kê
        const totalOrders = orders.length;
        const totalSpent = orders.reduce((sum, order) => sum + Number(order.total_amount), 0);
        const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;

        const firstOrder = orders[orders.length - 1];
        const lastOrder = orders[0];

        // 4. Phân tích top sản phẩm
        const productStats: Record<number, { product_name: string; quantity: number; total_spent: number }> = {};

        orders.forEach(order => {
            order.order_items.forEach(item => {
                const productId = item.variant_id;  // Use variant_id as key
                if (!productStats[productId]) {
                    productStats[productId] = {
                        product_name: item.product_variants.products.name,
                        quantity: 0,
                        total_spent: 0
                    };
                }
                productStats[productId].quantity += item.quantity;
                productStats[productId].total_spent += Number(item.total_price);  // Use total_price from schema
            });
        });

        const topProducts = Object.values(productStats)
            .sort((a, b) => b.total_spent - a.total_spent)
            .slice(0, 5);

        // 5. Format orders
        const formattedOrders = orders.map(order => ({
            order_id: order.order_id,
            order_code: order.order_code,
            created_at: order.created_at,
            total_amount: Number(order.total_amount),
            discount_amount: Number(order.discount_amount),
            payment_method_code: order.payment_method_code,
            status_code: order.status_code,
            employees: order['employees'] ? {
                users: {
                    full_name: order['employees'].users.full_name
                }
            } : undefined,
            users: { // Attach customer info to each order for consistency
                user_id: customer.user_id,
                full_name: customer.full_name,
                phone: customer.phone,
                email: customer.email
            },
            order_items: order.order_items.map(item => ({
                order_item_id: item.item_id,
                quantity: item.quantity,
                unit_price: Number(item.unit_price),
                total_price: Number(item.total_price),
                product_variants: {
                    sku: item.product_variants.sku,
                    option_name: item.product_variants.option_name,
                    products: {
                        name: item.product_variants.products.name
                    }
                }
            }))
        }));

        return {
            success: true,
            data: {
                customer: {
                    user_id: customer.user_id,
                    full_name: customer.full_name,
                    email: customer.email,
                    phone: customer.phone,
                    rank_code: customer.customers?.current_rank_code || 'BRONZE',
                    rank_name: customer.customers?.current_rank_code || 'BRONZE'  // Will format on frontend
                },
                statistics: {
                    total_orders: totalOrders,
                    total_spent: totalSpent,
                    avg_order_value: avgOrderValue,
                    first_order_date: firstOrder?.created_at || null,
                    last_order_date: lastOrder?.created_at || null
                },
                top_products: topProducts,
                orders: formattedOrders
            }
        };
    }

    /**
     * Đăng ký khách hàng nhanh tại quầy POS
     */
    async registerCustomer(dto: RegisterCustomerDto) {
        // 1. Kiểm tra số điện thoại đã tồn tại chưa
        const existingPhone = await this.prisma.users.findFirst({
            where: {
                phone: dto.phone,
                deleted_at: null
            }
        });

        if (existingPhone) {
            throw new ConflictException('Số điện thoại đã được đăng ký');
        }

        // 2. Kiểm tra email đã tồn tại chưa (nếu có)
        if (dto.email) {
            const existingEmail = await this.prisma.users.findFirst({
                where: {
                    email: dto.email,
                    deleted_at: null
                }
            });

            if (existingEmail) {
                throw new ConflictException('Email đã được đăng ký');
            }
        }

        // 3. Tạo mật khẩu ngẫu nhiên cho khách hàng
        const randomPassword = Math.random().toString(36).slice(-16);
        const hashedPassword = await bcrypt.hash(randomPassword, 10);

        // 4. Tạo user mới
        const user = await this.prisma.users.create({
            data: {
                email: dto.email || `customer${Date.now()}@temp.figicore.com`,
                password_hash: hashedPassword,
                full_name: dto.full_name,
                phone: dto.phone,
                role_code: 'CUSTOMER',
                status_code: 'ACTIVE'
            }
        });

        // 5. Tạo customer profile
        const customer = await this.prisma.customers.create({
            data: {
                user_id: user.user_id,
                current_rank_code: 'BRONZE',
                total_spent: 0,
                loyalty_points: 0
            }
        });

        // 6. Trả về thông tin khách hàng
        return {
            success: true,
            message: 'Đăng ký thành công',
            data: {
                user_id: user.user_id,
                full_name: user.full_name,
                phone: user.phone,
                email: dto.email || null,
                customers: {
                    current_rank_code: customer.current_rank_code,
                    total_spent: customer.total_spent
                }
            }
        };
    }
}
