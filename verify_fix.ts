import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const variant = await prisma.product_variants.findFirst({
    where: { sku: 'FIGI-002-LLN' },
    include: { product_promotions: true }
  });

  const now = new Date(); // Currently April 8 in user's world
  const promo = variant?.product_promotions;
  let isValidPromo = true;

  if (promo && promo.is_active) {
    const startDateBase = promo.start_date ? new Date(promo.start_date) : now;
    const endDateBase = promo.end_date ? new Date(promo.end_date) : now;

    const [startHH, startMM] = (promo.start_time || "00:00").split(':').map(Number);
    const [endHH, endMM] = (promo.end_time || "23:59").split(':').map(Number);

    const promoStart = new Date(startDateBase);
    promoStart.setHours(startHH, startMM, 0, 0);

    const promoEnd = new Date(endDateBase);
    promoEnd.setHours(endHH, endMM, 59, 999);

    if (promo.is_recurring && !promo.start_date && !promo.end_date) {
      promoStart.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
      promoEnd.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
    }

    if (now < promoStart || now > promoEnd) {
      isValidPromo = false;
    }

    console.log('--- PROMOTION CHECK ---');
    console.log('Now:', now.toISOString());
    console.log('Promo ID:', promo.promotion_id);
    console.log('Promo Start Boundary:', promoStart.toISOString());
    console.log('Promo End Boundary:', promoEnd.toISOString());
    console.log('Is Valid:', isValidPromo);
  } else {
    console.log('No active promotion found for variant.');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
