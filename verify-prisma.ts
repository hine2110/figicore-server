
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Verifying Prisma Client...');

    // Check if models exist in the client instance
    if ('product_variants' in prisma) {
        console.log('✅ product_variants model found.');
    } else {
        console.error('❌ product_variants model NOT found.');
    }

    if ('product_blindboxes' in prisma) {
        console.log('✅ product_blindboxes model found.');
    } else {
        console.error('❌ product_blindboxes model NOT found.');
    }

    if ('product_preorders' in prisma) {
        console.log('✅ product_preorders model found.');
    } else {
        console.error('❌ product_preorders model NOT found.');
    }

    // Try to inspect types (runtime check only)
    console.log('Prisma Client verification complete.');
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
