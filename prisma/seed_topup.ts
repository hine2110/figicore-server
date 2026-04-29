import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Start seeding wallets for customers...');
    const amountToTopup = 500000000; // 500 million VND

    // Find all users with role_code 'CUSTOMER'
    const customers = await prisma.users.findMany({
        where: {
            role_code: 'CUSTOMER'
        }
    });

    console.log(`Found ${customers.length} customers.`);

    for (const customer of customers) {
        // Upsert wallet for the customer
        const wallet = await prisma.wallets.upsert({
            where: {
                user_id: customer.user_id
            },
            update: {
                balance_available: {
                    increment: amountToTopup
                }
            },
            create: {
                user_id: customer.user_id,
                balance_available: amountToTopup,
                balance_locked: 0,
            }
        });

        // Add a transaction record
        await prisma.wallet_transactions.create({
            data: {
                wallet_id: wallet.wallet_id,
                type_code: 'TOPUP',
                amount: amountToTopup,
                reference_code: `TOPUP_SEED_${Date.now()}`,
                description: 'System seed topup for testing',
            }
        });

        console.log(`Topped up 500,000,000 VND for customer ID ${customer.user_id} (${customer.full_name})`);
    }

    console.log('Seeding finished.');
}

main()
    .catch((e) => {
        console.error(e);
        throw e;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
