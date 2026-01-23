
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function upsertLookup(type: string, code: string, value: string, sortOrder: number = 0) {
    const existing = await prisma.system_lookups.findFirst({
        where: { type, code }
    });

    if (existing) {
        console.log(`Updated lookup: ${type} - ${code}`);
        return prisma.system_lookups.update({
            where: { id: existing.id },
            data: { value, sort_order: sortOrder }
        });
    } else {
        console.log(`Created lookup: ${type} - ${code}`);
        return prisma.system_lookups.create({
            data: { type, code, value, sort_order: sortOrder }
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

    // 3. Seed Super Admin
    const saltRounds = 10;
    const adminPassword = 'Admin@123456';
    const hashedPassword = await bcrypt.hash(adminPassword, saltRounds);
    const adminEmail = 'admin@figicore.com';

    // Note: Ensuring role_code matches one of the seeded roles
    const adminUser = await prisma.users.upsert({
        where: { email: adminEmail },
        update: {
            role_code: 'SUPER_ADMIN', // Ensure Admin has SUPER_ADMIN role
        },
        create: {
            email: adminEmail,
            phone: '0000000000',
            full_name: 'Super Admin',
            password_hash: hashedPassword,
            role_code: 'SUPER_ADMIN',
            status_code: 'ACTIVE',
            is_verified: true,
        },
    });

    console.log(`Created/Updated Admin: ${adminUser.email} with Role: ${adminUser.role_code}`);
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
