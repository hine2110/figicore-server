
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const categories = await prisma.categories.findMany({ select: { category_id: true, name: true }, take: 5 });
  const brands = await prisma.brands.findMany({ select: { brand_id: true, name: true }, take: 5 });
  
  console.log('Categories:', JSON.stringify(categories, null, 2));
  console.log('Brands:', JSON.stringify(brands, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
