import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Hàm Upsert Lookup chuẩn
 * Hỗ trợ cập nhật cả Meta Data (JSON) dùng cho Config Frontend/Logic
 */
async function upsertLookup(type: string, code: string, value: string, sortOrder: number = 0, metaData: any = null) {
    const existing = await prisma.system_lookups.findFirst({
        where: { type, code }
    });

    if (existing) {
        console.log(`🔄 Update: ${type} - ${code}`);
        return prisma.system_lookups.update({
            where: { id: existing.id },
            data: {
                value,
                sort_order: sortOrder,
                meta_data: metaData ?? existing.meta_data // Giữ meta cũ nếu không truyền mới
            }
        });
    } else {
        console.log(`✅ Create: ${type} - ${code}`);
        return prisma.system_lookups.create({
            data: {
                type,
                code,
                value,
                sort_order: sortOrder,
                meta_data: metaData
            }
        });
    }
}

async function main() {
    console.log('🚀 BẮT ĐẦU SEED DỮ LIỆU HỆ THỐNG FIGICORE...');

    // ==========================================
    // 1. PHÂN QUYỀN & NGƯỜI DÙNG (USER & ROLES)
    // ==========================================
    console.log('--- 1. User Roles & Status ---');

    // Roles
    await upsertLookup('USER_ROLE', 'SUPER_ADMIN', 'System Owner', 1);
    await upsertLookup('USER_ROLE', 'MANAGER', 'Cửa Hàng Trưởng', 2);
    await upsertLookup('USER_ROLE', 'STAFF_POS', 'Nhân Viên Bán Hàng', 3);
    await upsertLookup('USER_ROLE', 'STAFF_INVENTORY', 'Thủ Kho', 4);
    await upsertLookup('USER_ROLE', 'CUSTOMER', 'Khách Hàng (Member)', 5);

    // Status
    await upsertLookup('USER_STATUS', 'ACTIVE', 'Hoạt Động', 1, { color: 'green' });
    await upsertLookup('USER_STATUS', 'INACTIVE', 'Tạm Khóa', 2, { color: 'gray' });
    await upsertLookup('USER_STATUS', 'BANNED', 'Cấm Vĩnh Viễn', 3, { color: 'red' });

    // ==========================================
    // 2. DANH MỤC SẢN PHẨM (CORE BUSINESS) 🔥
    // ==========================================
    console.log('--- 2. Product Types & Logic ---');

    // PRODUCT_TYPE: Định nghĩa luồng xử lý (Form Flow) cho Frontend & Backend
    await upsertLookup('PRODUCT_TYPE', 'RETAIL', 'Hàng Bán Lẻ (Standard)', 1, {
        is_physical: true,
        has_variants: true,
        form_fields: ['variants', 'brand'],
        description: 'Sản phẩm vật lý, quản lý tồn kho theo SKU/Variant.'
    });

    await upsertLookup('PRODUCT_TYPE', 'BLINDBOX', 'Blind Box (Túi Mù)', 2, {
        is_physical: false, // Là sản phẩm ảo (Wrapper)
        has_variants: false,
        algo_type: 'LUCKY_BAG_DYNAMIC', // Thuật toán túi mù động
        form_fields: ['price_config', 'min_value', 'max_value', 'margin'],
        description: 'Gói may mắn, hệ thống tự chọn item Retail để trả khách.'
    });

    await upsertLookup('PRODUCT_TYPE', 'PREORDER', 'Hàng Đặt Trước', 3, {
        is_physical: true,
        is_preorder: true,
        form_fields: ['deposit_amount', 'release_date', 'max_slots'],
        description: 'Hàng chưa về kho, quản lý cọc và ngày phát hành.'
    });

    // PRODUCT_STATUS: Vòng đời sản phẩm
    await upsertLookup('PRODUCT_STATUS', 'DRAFT', 'Nháp', 1, { allow_sale: false, visible: false });
    await upsertLookup('PRODUCT_STATUS', 'ACTIVE', 'Đang Kinh Doanh', 2, { allow_sale: true, visible: true });
    await upsertLookup('PRODUCT_STATUS', 'INACTIVE', 'Ngừng Kinh Doanh', 3, { allow_sale: false, visible: false }); // Soft Delete
    await upsertLookup('PRODUCT_STATUS', 'COMING_SOON', 'Sắp Ra Mắt', 4, { allow_sale: false, visible: true });

    // ==========================================
    // 3. KHO VẬN & GIAO DỊCH (INVENTORY LOGIC)
    // ==========================================
    console.log('--- 3. Inventory Transaction Types ---');

    // INVENTORY_TYPE: Lý do tăng/giảm kho (Cực quan trọng cho Report)
    await upsertLookup('INVENTORY_TYPE', 'INBOUND_PO', 'Nhập Kho (Purchase Order)', 1, { sign: 1 });
    await upsertLookup('INVENTORY_TYPE', 'OUTBOUND_SALE', 'Xuất Bán (Order)', 2, { sign: -1 });
    await upsertLookup('INVENTORY_TYPE', 'RETURN_REFUND', 'Khách Trả Hàng', 3, { sign: 1 });
    await upsertLookup('INVENTORY_TYPE', 'ADJUSTMENT_LOSS', 'Xuất Hủy / Vỡ / Mất', 4, { sign: -1 });
    await upsertLookup('INVENTORY_TYPE', 'ADJUSTMENT_ADD', 'Kiểm Kê (Thừa)', 5, { sign: 1 });
    await upsertLookup('INVENTORY_TYPE', 'BLINDBOX_CONVERT', 'Dùng Cho Blindbox', 6, { sign: -1 }); // Trừ kho Retail khi bán gói Blindbox

    // ==========================================
    // 4. KHÁCH HÀNG THÂN THIẾT (LOYALTY)
    // ==========================================
    console.log('--- 4. Customer Ranks ---');

    const ranks = [
        { code: 'BRONZE', value: 'Newbie Collector', sort: 1, meta: { threshold: 0, discount: 0, color: '#CD7F32' } },
        { code: 'SILVER', value: 'Active Collector', sort: 2, meta: { threshold: 2000000, discount: 2, color: '#C0C0C0' } },
        { code: 'GOLD', value: 'Elite Collector', sort: 3, meta: { threshold: 10000000, discount: 5, color: '#FFD700' } },
        { code: 'DIAMOND', value: 'Legendary Collector', sort: 4, meta: { threshold: 50000000, discount: 10, color: '#B9F2FF' } },
    ];
    for (const r of ranks) await upsertLookup('CUSTOMER_RANK', r.code, r.value, r.sort, r.meta);

    // ==========================================
    // 5. Seed SHIFT_CODE (Mandatory for WorkSchedules)
    // ==========================================
    console.log('Seeding SHIFT_CODE...');

    const shifts = [
        { code: 'MORNING', value: 'Morning Shift (8AM-12PM)', sort: 1 },
        { code: 'AFTERNOON', value: 'Afternoon Shift (1PM-5PM)', sort: 2 },
        { code: 'EVENING', value: 'Evening Shift (5PM-9PM)', sort: 3 },
    ];

    for (const shift of shifts) {
        await upsertLookup('SHIFT_CODE', shift.code, shift.value, shift.sort);
    }

    // ==========================================
    // 6. TÀI KHOẢN QUẢN TRỊ (SUPER ADMIN)
    // ==========================================
    console.log('--- 6. Super Admin Account ---');

    const adminEmail = 'admin@figicore.com';
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash('Admin@123456', saltRounds);

    await prisma.users.upsert({
        where: { email: adminEmail },
        update: { role_code: 'SUPER_ADMIN' },
        create: {
            email: adminEmail,
            phone: '0999999999',
            full_name: 'FigiCore Owner',
            password_hash: hashedPassword,
            role_code: 'SUPER_ADMIN',
            status_code: 'ACTIVE',
            is_verified: true,
            // Google ID để trống vì tạo thủ công
        },
    });
    console.log(`✅ Admin Account Ready: ${adminEmail}`);

    // ==========================================
    // 7. TRẠNG THÁI ĐƠN HÀNG (ORDER STATUS)
    // ==========================================
    console.log('--- 7. Seeding Order Status ---');

    // Initial state: Order created, payment pending
    await upsertLookup('ORDER_STATUS', 'PENDING_PAYMENT', 'Chờ Thanh Toán', 1);

    // Payment confirmed (or COD verified), ready for packing
    await upsertLookup('ORDER_STATUS', 'PROCESSING', 'Đang Xử Lý', 2);

    // Handed over to carrier (GHN)
    await upsertLookup('ORDER_STATUS', 'SHIPPING', 'Đang Vận Chuyển', 3);

    // Customer received goods
    await upsertLookup('ORDER_STATUS', 'COMPLETED', 'Hoàn Thành', 4);

    // Order cancelled (Stock returned)
    await upsertLookup('ORDER_STATUS', 'CANCELLED', 'Đã Hủy', 5);

    // Refund processed
    await upsertLookup('ORDER_STATUS', 'REFUNDED', 'Đã Hoàn Tiền', 6);

    // Failed delivery (Returned to shop)
    await upsertLookup('ORDER_STATUS', 'RETURNED', 'Trả Hàng', 7);

    // [NEW] Order expired due to timeout (System auto-cancel)
    await upsertLookup('ORDER_STATUS', 'EXPIRED', 'Hết Hạn Thanh Toán', 8);

    console.log('✅ Order Status Seeding Completed!');

    console.log('🎉 SEEDING HOÀN TẤT! Hệ thống đã sẵn sàng định danh.');
}

main()
    .catch((e) => {
        console.error('❌ Seeding Error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });