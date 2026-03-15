import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const idsToDelete = [11, 12];
  console.log(`Starting hard delete for product IDs: ${idsToDelete.join(', ')}`);

  for (const id of idsToDelete) {
    try {
      // Check if product exists
      const product = await prisma.products.findUnique({
        where: { product_id: id },
        include: { product_variants: true }
      });

      if (!product) {
        console.log(`Product ID ${id} not found, skipping.`);
        continue;
      }

      console.log(`Deleting product: ${product.name} (ID: ${id}) and its ${product.product_variants.length} variants.`);
      
      // Delete the product. Cascading delete should handle variants.
      await prisma.products.delete({
        where: { product_id: id }
      });

      console.log(`Successfully deleted product ID ${id}.`);
    } catch (error) {
      console.error(`Error deleting product ID ${id}:`, error.message);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
