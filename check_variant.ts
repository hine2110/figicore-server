import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const variant = await prisma.product_variants.findFirst({
    where: { sku: 'FIGI-002-LLN' },
    include: { product_promotions: true }
  });
  console.log('Now:', new Date().toISOString());
  console.log(JSON.stringify(variant, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
