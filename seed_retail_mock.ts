
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const retailItems = [
  { name: "RG 1/144 RX-93-v2 Hi-v Gundam", category_id: 1, brand_id: 1, price: 1200000, stock: 50 },
  { name: "MG 1/100 Gundam Barbatos", category_id: 1, brand_id: 1, price: 950000, stock: 30 },
  { name: "HG 1/144 Rising Freedom Gundam", category_id: 1, brand_id: 1, price: 450000, stock: 100 },
  { name: "Mechanical Keyboard RGB G Pro", category_id: 1, brand_id: 1, price: 2100000, stock: 20 },
  { name: "Wireless Gaming Mouse V3", category_id: 1, brand_id: 1, price: 1500000, stock: 45 },
  { name: "Noise Cancelling Headphones X5", category_id: 1, brand_id: 1, price: 3200000, stock: 15 },
  { name: "Premium Cotton T-Shirt Black", category_id: 1, brand_id: 1, price: 250000, stock: 200 },
  { name: "Tech Backpack Waterproof", category_id: 1, brand_id: 1, price: 850000, stock: 60 },
  { name: "Smart Watch S8 Ultra", category_id: 1, brand_id: 1, price: 1800000, stock: 25 },
  { name: "Portable Power Bank 20000mAh", category_id: 1, brand_id: 1, price: 550000, stock: 80 },
  { name: "LED Desk Lamp Eye-Care", category_id: 1, brand_id: 1, price: 350000, stock: 40 },
  { name: "Stainless Steel Water Bottle", category_id: 1, brand_id: 1, price: 180000, stock: 120 },
  { name: "Anime Figure: Luffy Gear 5", category_id: 1, brand_id: 1, price: 1100000, stock: 10 },
  { name: "Building Blocks Castle Set", category_id: 1, brand_id: 1, price: 750000, stock: 35 },
  { name: "USB-C To HDMI Adapter 4K", category_id: 1, brand_id: 1, price: 290000, stock: 90 },
];

async function seed() {
  console.log('Starting retail data seeding...');
  
  for (const item of retailItems) {
    const sku = `RET-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    
    try {
      const product = await prisma.products.create({
        data: {
          name: item.name,
          type_code: "RETAIL",
          status_code: "ACTIVE",
          category_id: item.category_id,
          brand_id: item.brand_id,
          description: `This is a premium ${item.name} for retail customers.`,
          product_variants: {
            create: {
              sku: sku,
              option_name: "Standard Edition",
              price: item.price,
              stock_available: item.stock,
              weight_g: 500,
              length_cm: 20,
              width_cm: 15,
              height_cm: 10,
              media_assets: JSON.stringify([])
            }
          }
        }
      });
      console.log(`Created product: ${product.name} (ID: ${product.product_id})`);
    } catch (error: any) {
      console.error(`Failed to create ${item.name}:`, error.message);
    }
  }
  
  console.log('Seeding completed!');
}

seed()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
