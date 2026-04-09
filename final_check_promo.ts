import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const promo = await prisma.product_promotions.findUnique({ where: { promotion_id: 6 } });
  console.log(JSON.stringify(promo, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
