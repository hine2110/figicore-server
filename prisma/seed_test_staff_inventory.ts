// File: prisma/seed_test_staff_inventory.ts
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('📦 START: Seeding Test Warehouse Staff...');

    // 1. Cấu hình tài khoản test
    const staffEmail = 'kho@figicore.com';
    const rawPassword = '123456'; // Mật khẩu dễ nhớ để test
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(rawPassword, saltRounds);

    // 2. Tạo hoặc Update nhân viên Kho
    const staffUser = await prisma.users.upsert({
        where: { email: staffEmail },
        update: {
            role_code: 'STAFF_INVENTORY', // Đảm bảo đúng quyền
            status_code: 'ACTIVE',
            password_hash: hashedPassword, // Reset lại pass nếu quên
        },
        create: {
            email: staffEmail,
            phone: '0901234567',
            full_name: 'Mr. Thủ Kho (Test)',
            password_hash: hashedPassword,
            role_code: 'STAFF_INVENTORY',
            status_code: 'ACTIVE',
            is_verified: true,
            avatar_url: 'https://ui-avatars.com/api/?name=Thu+Kho&background=random'
        },
    });

    console.log('------------------------------------------------');
    console.log('✅ TÀI KHOẢN KHO ĐÃ SẴN SÀNG!');
    console.log(`👤 Email:    ${staffEmail}`);
    console.log(`🔑 Password: ${rawPassword}`);
    console.log('------------------------------------------------');
}

main()
    .catch((e) => {
        console.error('❌ Error seeding staff:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });