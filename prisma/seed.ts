import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Nâng cấp hàm upsert để hỗ trợ meta_data (JSON)
async function upsertLookup(type: string, code: string, value: string, sortOrder: number = 0, metaData: any = null) {
    const existing = await prisma.system_lookups.findFirst({
        where: { type, code }
    });

    if (existing) {
        console.log(`Updated lookup: ${type} - ${code}`);
        return prisma.system_lookups.update({
            where: { id: existing.id },
            data: {
                value,
                sort_order: sortOrder,
                meta_data: metaData ?? existing.meta_data // Update meta nếu có
            }
        });
    } else {
        console.log(`Created lookup: ${type} - ${code}`);
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
    console.log('Start seeding ...');

    // 1. Seed Roles
    console.log('Seeding Roles...');
    const roles = [
        { code: 'SUPER_ADMIN', value: 'System Owner', sort: 1 },
        { code: 'MANAGER', value: 'Store Manager', sort: 2 },
        { code: 'STAFF_POS', value: 'Sales Staff', sort: 3 },
        { code: 'STAFF_INVENTORY', value: 'Warehouse Staff', sort: 4 },
        { code: 'CUSTOMER', value: 'End User', sort: 5 },
    ];

    for (const role of roles) {
        await upsertLookup('USER_ROLE', role.code, role.value, role.sort);
    }

    // 2. Seed Statuses
    console.log('Seeding Statuses...');
    const statuses = [
        { code: 'ACTIVE', value: 'Active', sort: 1 },
        { code: 'INACTIVE', value: 'Inactive', sort: 2 },
        { code: 'BANNED', value: 'Banned', sort: 3 },
    ];

    for (const status of statuses) {
        await upsertLookup('USER_STATUS', status.code, status.value, status.sort);
    }

    // 3. Seed Customer Ranks (NEW FEATURE) 🏆
    console.log('Seeding Customer Ranks...');
    const ranks = [
        {
            code: 'BRONZE',
            value: 'Newbie Collector',
            sort: 1,
            meta: { threshold: 0, discount_rate: 0, color: '#CD7F32' } // Màu đồng
        },
        {
            code: 'SILVER',
            value: 'Active Collector',
            sort: 2,
            meta: { threshold: 2000000, discount_rate: 2, color: '#C0C0C0' } // Màu bạc (Tiêu 2tr)
        },
        {
            code: 'GOLD',
            value: 'Elite Collector',
            sort: 3,
            meta: { threshold: 10000000, discount_rate: 5, color: '#FFD700' } // Màu vàng (Tiêu 10tr)
        },
        {
            code: 'DIAMOND',
            value: 'Legendary Collector',
            sort: 4,
            meta: { threshold: 50000000, discount_rate: 10, color: '#B9F2FF' } // Màu kim cương (Tiêu 50tr)
        },
    ];

    for (const rank of ranks) {
        await upsertLookup('CUSTOMER_RANK', rank.code, rank.value, rank.sort, rank.meta);
    }

    // 4. Seed Super Admin
    const saltRounds = 10;
    const adminPassword = 'Admin@123456';
    const hashedPassword = await bcrypt.hash(adminPassword, saltRounds);
    const adminEmail = 'admin@figicore.com';

    const adminUser = await prisma.users.upsert({
        where: { email: adminEmail },
        update: {
            role_code: 'SUPER_ADMIN',
        },
        create: {
            email: adminEmail,
            phone: '0000000000',
            full_name: 'Super Admin',
            password_hash: hashedPassword,
            role_code: 'SUPER_ADMIN',
            status_code: 'ACTIVE',
            is_verified: true,
            // Admin thì không cần record trong bảng customers, nhưng nếu hệ thống yêu cầu thì thêm sau
        },
    });

    console.log(`Created/Updated Admin: ${adminUser.email}`);
    console.log('Seeding finished.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });