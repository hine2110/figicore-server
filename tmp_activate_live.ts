import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // 1. Set Livestream 3 to LIVE
  await prisma.livestreams.update({
    where: { id: 3 },
    data: { 
      status: 'LIVE',
      start_time: new Date(),
      cover_url: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=1000'
    }
  });

  // 2. Ensure it has products
  const products = await prisma.product_variants.findMany({ take: 3 });
  
  if (products.length > 0) {
    await prisma.livestream_products.deleteMany({ where: { livestream_id: 3 } });
    await prisma.livestream_products.createMany({
      data: products.map(p => ({
        livestream_id: 3,
        variant_id: p.variant_id,
        flash_sale_price: Number(p.price) * 0.9, // 10% off for testing
        flash_sale_stock: 10
      }))
    });
  }

  console.log("Livestream 3 is now LIVE with products.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
