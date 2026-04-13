import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Initializing Prisma Client...");
    
    // 1. Lấy tất cả user hiện có
    const users = await prisma.users.findMany();
    
    for (const u of users) {
        // 2. Add or update wallet
        const wallet = await prisma.wallets.upsert({
            where: { user_id: u.user_id },
            update: { balance_available: { increment: 50000000 } }, // +50,000,000 VND
            create: {
                user_id: u.user_id,
                balance_available: 50000000,
                balance_locked: 0
            }
        });
        
        console.log(`Topped up 50M VND for user ${u.email} (Wallet ID: ${wallet.wallet_id})`);
    }

    console.log("✅ Top-up completed successfully for all users!");
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
