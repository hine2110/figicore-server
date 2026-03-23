"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcrypt"));
const prisma = new client_1.PrismaClient();
async function upsertLookup(type, code, value, sortOrder = 0, metaData = null) {
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
                meta_data: metaData ?? existing.meta_data
            }
        });
    }
    else {
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
    console.log('--- 1. User Roles & Status ---');
    await upsertLookup('USER_ROLE', 'SUPER_ADMIN', 'System Owner', 1);
    await upsertLookup('USER_ROLE', 'MANAGER', 'Cửa Hàng Trưởng', 2);
    await upsertLookup('USER_ROLE', 'STAFF_POS', 'Nhân Viên Bán Hàng', 3);
    await upsertLookup('USER_ROLE', 'STAFF_INVENTORY', 'Thủ Kho', 4);
    await upsertLookup('USER_ROLE', 'CUSTOMER', 'Khách Hàng (Member)', 5);
    await upsertLookup('USER_STATUS', 'ACTIVE', 'Hoạt Động', 1, { color: 'green' });
    await upsertLookup('USER_STATUS', 'INACTIVE', 'Tạm Khóa', 2, { color: 'gray' });
    await upsertLookup('USER_STATUS', 'BANNED', 'Cấm Vĩnh Viễn', 3, { color: 'red' });
    console.log('--- 2. Product Types & Logic ---');
    await upsertLookup('PRODUCT_TYPE', 'RETAIL', 'Hàng Bán Lẻ (Standard)', 1, {
        is_physical: true,
        has_variants: true,
        form_fields: ['variants', 'brand'],
        description: 'Sản phẩm vật lý, quản lý tồn kho theo SKU/Variant.'
    });
    await upsertLookup('PRODUCT_TYPE', 'BLINDBOX', 'Blind Box (Túi Mù)', 2, {
        is_physical: false,
        has_variants: false,
        algo_type: 'LUCKY_BAG_DYNAMIC',
        form_fields: ['price_config', 'min_value', 'max_value', 'margin'],
        description: 'Gói may mắn, hệ thống tự chọn item Retail để trả khách.'
    });
    await upsertLookup('PRODUCT_TYPE', 'PREORDER', 'Hàng Đặt Trước', 3, {
        is_physical: true,
        is_preorder: true,
        form_fields: ['deposit_amount', 'release_date', 'max_slots'],
        description: 'Hàng chưa về kho, quản lý cọc và ngày phát hành.'
    });
    await upsertLookup('PRODUCT_STATUS', 'DRAFT', 'Nháp', 1, { allow_sale: false, visible: false });
    await upsertLookup('PRODUCT_STATUS', 'ACTIVE', 'Đang Kinh Doanh', 2, { allow_sale: true, visible: true });
    await upsertLookup('PRODUCT_STATUS', 'INACTIVE', 'Ngừng Kinh Doanh', 3, { allow_sale: false, visible: false });
    await upsertLookup('PRODUCT_STATUS', 'COMING_SOON', 'Sắp Ra Mắt', 4, { allow_sale: false, visible: true });
    console.log('--- 3. Inventory Transaction Types ---');
    await upsertLookup('INVENTORY_TYPE', 'INBOUND_PO', 'Nhập Kho (Purchase Order)', 1, { sign: 1 });
    await upsertLookup('INVENTORY_TYPE', 'OUTBOUND_SALE', 'Xuất Bán (Order)', 2, { sign: -1 });
    await upsertLookup('INVENTORY_TYPE', 'RETURN_REFUND', 'Khách Trả Hàng', 3, { sign: 1 });
    await upsertLookup('INVENTORY_TYPE', 'ADJUSTMENT_LOSS', 'Xuất Hủy / Vỡ / Mất', 4, { sign: -1 });
    await upsertLookup('INVENTORY_TYPE', 'ADJUSTMENT_ADD', 'Kiểm Kê (Thừa)', 5, { sign: 1 });
    await upsertLookup('INVENTORY_TYPE', 'BLINDBOX_CONVERT', 'Dùng Cho Blindbox', 6, { sign: -1 });
    console.log('--- 4. Customer Ranks ---');
    const ranks = [
        { code: 'BRONZE', value: 'Newbie Collector', sort: 1, meta: { threshold: 0, discount: 0, color: '#CD7F32' } },
        { code: 'SILVER', value: 'Active Collector', sort: 2, meta: { threshold: 2000000, discount: 2, color: '#C0C0C0' } },
        { code: 'GOLD', value: 'Elite Collector', sort: 3, meta: { threshold: 10000000, discount: 5, color: '#FFD700' } },
        { code: 'DIAMOND', value: 'Legendary Collector', sort: 4, meta: { threshold: 50000000, discount: 10, color: '#B9F2FF' } },
    ];
    for (const r of ranks)
        await upsertLookup('CUSTOMER_RANK', r.code, r.value, r.sort, r.meta);
    console.log('Seeding SHIFT_CODE...');
    const shifts = [
        { code: 'MORNING', value: 'Morning Shift (8AM-12PM)', sort: 1 },
        { code: 'AFTERNOON', value: 'Afternoon Shift (1PM-5PM)', sort: 2 },
        { code: 'EVENING', value: 'Evening Shift (5PM-9PM)', sort: 3 },
    ];
    for (const shift of shifts) {
        await upsertLookup('SHIFT_CODE', shift.code, shift.value, shift.sort);
    }
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
        },
    });
    console.log(`✅ Admin Account Ready: ${adminEmail}`);
    console.log('--- 7. Seeding Order Status ---');
    await upsertLookup('ORDER_STATUS', 'PENDING_PAYMENT', 'Pending Payment', 1);
    await upsertLookup('ORDER_STATUS', 'EXPIRED', 'Payment Expired', 2);
    await upsertLookup('ORDER_STATUS', 'PROCESSING', 'Processing', 3);
    await upsertLookup('ORDER_STATUS', 'PACKED', 'Packed', 4);
    await upsertLookup('ORDER_STATUS', 'AWAITING_PICKUP', 'Awaiting Pickup', 5);
    await upsertLookup('ORDER_STATUS', 'SHIPPING', 'Shipping', 6);
    await upsertLookup('ORDER_STATUS', 'COMPLETED', 'Completed', 7);
    await upsertLookup('ORDER_STATUS', 'CANCELLED', 'Cancelled', 8);
    await upsertLookup('ORDER_STATUS', 'DELIVERY_FAILED', 'Delivery Failed', 9);
    await upsertLookup('ORDER_STATUS', 'RETURN_REQUESTED', 'Return Requested', 10);
    await upsertLookup('ORDER_STATUS', 'RETURN_APPROVED', 'Return Approved', 11);
    await upsertLookup('ORDER_STATUS', 'RETURNING', 'Returning', 12);
    await upsertLookup('ORDER_STATUS', 'RETURNED', 'Returned', 13);
    await upsertLookup('ORDER_STATUS', 'REFUNDED', 'Refunded', 14);
    await upsertLookup('ORDER_STATUS', 'DEPOSITED', 'Đã Cọc (Chờ Hàng)', 20, { color: 'purple' });
    await upsertLookup('ORDER_STATUS', 'READY_FOR_PAYMENT', 'Hàng Về (Chờ Thanh Toán)', 21, { color: 'orange' });
    console.log('✅ Order Status Seeding Completed!');
    console.log('--- 8. Seeding Channels & Payments ---');
    await upsertLookup('CHANNEL', 'WEB', 'Website', 1);
    await upsertLookup('CHANNEL', 'POS', 'Point of Sale (In-Store)', 2);
    await upsertLookup('PAYMENT_METHOD', 'QR_BANK', 'QR Banking (VietQR)', 1, { description: 'Scan QR code with banking app', icon: 'qr_code' });
    await upsertLookup('PAYMENT_METHOD', 'WALLET', 'FigiWallet', 2, { description: 'Pay with wallet balance', icon: 'wallet' });
    await upsertLookup('PAYMENT_METHOD', 'CASH', 'Cash', 3, { description: 'Pay cash at counter', icon: 'cash' });
    console.log('--- 9. Seeding Timesheet Status ---');
    await upsertLookup('TIMESHEET_STATUS', 'PRESENT', 'Đang làm việc (Đúng giờ)', 1, { color: 'green' });
    await upsertLookup('TIMESHEET_STATUS', 'LATE', 'Đang làm việc (Đi trễ)', 2, { color: 'red' });
    await upsertLookup('TIMESHEET_STATUS', 'COMPLETED', 'Hoàn thành (Đúng giờ)', 3, { color: 'blue' });
    await upsertLookup('TIMESHEET_STATUS', 'EARLY_LEAVE', 'Về sớm', 4, { color: 'orange' });
    await upsertLookup('TIMESHEET_STATUS', 'MISSING', 'Quên Check-out', 5, { color: 'purple' });
    await upsertLookup('TIMESHEET_STATUS', 'ABSENT', 'Vắng mặt', 6, { color: 'gray' });
    console.log('✅ Timesheet Status Seeding Completed!');
    console.log('--- 10. Seeding HR & Payroll Lookups ---');
    await upsertLookup('PAYROLL_STATUS', 'DRAFT', 'Nháp', 1);
    await upsertLookup('PAYROLL_STATUS', 'SENT_FOR_REVIEW', 'Gửi Chờ Duyệt (Quản lý)', 2);
    await upsertLookup('PAYROLL_STATUS', 'DISPUTED', 'Đang Khiếu Nại', 3);
    await upsertLookup('PAYROLL_STATUS', 'PENDING_APPROVAL', 'Chờ Duyệt (Admin)', 4);
    await upsertLookup('PAYROLL_STATUS', 'APPROVED', 'Đã Duyệt', 5);
    await upsertLookup('PAYROLL_STATUS', 'PAID', 'Đã Thanh Toán', 6);
    await upsertLookup('SALARY_ITEM_TYPE', 'ALLOWANCE', 'Phụ Cấp', 1);
    await upsertLookup('SALARY_ITEM_TYPE', 'DEDUCTION', 'Khấu Trừ', 2);
    await upsertLookup('LEAVE_TYPE', 'ANNUAL_PAID', 'Nghỉ Phép Năm (Có Lương)', 1);
    await upsertLookup('LEAVE_TYPE', 'UNPAID', 'Nghỉ Không Lương', 2);
    await upsertLookup('LEAVE_TYPE', 'SICK', 'Nghỉ Ốm', 3);
    console.log('✅ HR & Payroll Lookups Seeding Completed!');
    console.log('--- 11. Seeding Timesheet Correction Status ---');
    await upsertLookup('CORRECTION_STATUS', 'PENDING', 'Chờ duyệt', 1);
    await upsertLookup('CORRECTION_STATUS', 'APPROVED', 'Đã duyệt', 2);
    await upsertLookup('CORRECTION_STATUS', 'REJECTED', 'Từ chối', 3);
    console.log('--- Seeding Salary Change Reasons ---');
    await upsertLookup('SALARY_CHANGE_REASON', 'ANNUAL_REVIEW', 'Đánh giá định kỳ (Review hàng năm)', 1);
    await upsertLookup('SALARY_CHANGE_REASON', 'PROMOTION', 'Thăng tiến/Lên cấp', 2);
    await upsertLookup('SALARY_CHANGE_REASON', 'DEMOTION', 'Giáng chức/Hạ cấp', 3);
    await upsertLookup('SALARY_CHANGE_REASON', 'CORRECTION', 'Điều chỉnh do sai sót dữ liệu', 4);
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
//# sourceMappingURL=seed.js.map