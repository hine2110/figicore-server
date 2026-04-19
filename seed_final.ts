import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// ─── HELPER ──────────────────────────────────────────────────────────────────
const genSku = (prefix: string, idx: number) =>
  `${prefix}-${Date.now()}-${idx}`;

const vnd = (n: number) => n.toLocaleString('vi-VN') + ' VND';

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 BẮT ĐẦU DỌN DẸP VÀ NẠP DỮ LIỆU HỆ THỐNG MỚI (RETAIL 100 + TOPUP CUSTOMER)...');

  // ── 0. Xóa dữ liệu cũ ──────────────────
  await prisma.cart_items.deleteMany();
  await prisma.return_items.deleteMany();
  await prisma.return_requests.deleteMany();
  await prisma.order_items.deleteMany();
  await prisma.order_status_history.deleteMany();
  await prisma.payment_transactions.deleteMany();
  await prisma.shipments.deleteMany();
  await prisma.orders.deleteMany();
  await prisma.inventory_logs.deleteMany();
  await prisma.inventory_receipt_items.deleteMany();
  await prisma.preorder_contracts.deleteMany();
  await prisma.auctions.deleteMany();
  await prisma.product_blindboxes.deleteMany();
  await prisma.product_preorder_configs.deleteMany();
  await prisma.product_variants.deleteMany();
  await prisma.products.deleteMany();
  console.log('🗑️  Đã xóa sạch dữ liệu sản phẩm cũ!');

  // ── 1. Setup Brands & Categories ─────────────────────────────────────────
  const categoryDefs = ['Model Kits', 'Action Figures', 'Art Toys', 'Lego & Blocks', 'Statues', 'Tools & Supplies'];
  const brandDefs = ['Bandai', 'Moshow Toys', 'Hot Toys', 'Pop Mart', 'Good Smile Company', 'Lego', 'Hasbro', 'Kotobukiya', 'Iron Studio', 'Tamiya', 'Mr. Hobby'];

  const catMap = new Map<string, number>();
  const brandMap = new Map<string, number>();

  for (const name of categoryDefs) {
    const c = await prisma.categories.upsert({
      where: { name },
      update: {},
      create: { name, slug: name.toLowerCase().replace(/ /g, '-') },
    });
    catMap.set(name, c.category_id);
  }

  for (const name of brandDefs) {
    const b = await prisma.brands.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    brandMap.set(name, b.brand_id);
  }

  // ── 2. DATA GENERATOR FOR 100 PRODUCTS ─────────────────────────────────────
  const productTemplates = [
    { name: 'Gundam {name}', cat: 'Model Kits', brand: 'Bandai', priceRange: [500000, 5000000] },
    { name: '{name} Action Figure', cat: 'Action Figures', brand: 'Hasbro', priceRange: [600000, 2500000] },
    { name: '{name} 1/6 Scale Figure', cat: 'Action Figures', brand: 'Hot Toys', priceRange: [4000000, 15000000] },
    { name: 'SKULLPANDA {name}', cat: 'Art Toys', brand: 'Pop Mart', priceRange: [300000, 4500000] },
    { name: 'Nendoroid {name}', cat: 'Art Toys', brand: 'Good Smile Company', priceRange: [800000, 1500000] },
    { name: 'Lego Star Wars {name}', cat: 'Lego & Blocks', brand: 'Lego', priceRange: [1000000, 20000000] },
    { name: '{name} Metal Build', cat: 'Action Figures', brand: 'Moshow Toys', priceRange: [2500000, 6000000] },
    { name: '{name} Statue', cat: 'Statues', brand: 'Iron Studio', priceRange: [3000000, 25000000] },
    { name: 'Modeler Tool {name}', cat: 'Tools & Supplies', brand: 'Tamiya', priceRange: [100000, 1000000] },
  ];

  const suffixes = ['Alpha', 'Delta', 'Zero', 'Premium', 'Elite', 'Master', 'Limited', 'Special', 'Ultimate', 'Vintage', 'Modern', 'Cyber', 'Neon', 'Dark', 'Light', 'Gold', 'Silver', 'Iron', 'Steel', 'Storm', 'Shadow', 'Flame', 'Frost', 'Thunder', 'Blast'];

  console.log('📦 Đang tạo 100 sản phẩm Retail với mô tả chi tiết từng biến thể...');

  let variantTotal = 0;
  for (let i = 1; i <= 100; i++) {
    const template = productTemplates[randomInt(0, productTemplates.length - 1)];
    const suffix = suffixes[randomInt(0, suffixes.length - 1)];
    const pName = template.name.replace('{name}', suffix) + ` #${i}`;
    
    const basePrice = Math.round(randomInt(template.priceRange[0], template.priceRange[1]) / 1000) * 1000;
    
    const product = await prisma.products.create({
      data: {
        name: pName,
        type_code: 'RETAIL',
        status_code: 'ACTIVE',
        category_id: catMap.get(template.cat),
        brand_id: brandMap.get(template.brand),
        description: `${pName} là một siêu phẩm không thể thiếu trong bộ sưu tập của bạn. Hãy chọn phiên bản phù hợp để xem mô tả chi tiết riêng cho từng biến thể.`,
        media_urls: [],
      }
    });

    const numVariants = randomInt(2, 4);
    for (let vIdx = 0; vIdx < numVariants; vIdx++) {
      const optionName = vIdx === 0 ? 'Standard Edition' : (vIdx === 1 ? 'Collectors Edition' : `Limited Bundle ${vIdx}`);
      
      // MÔ TẢ RIÊNG BIỆT CHO TỪNG VARIANT
      const variantDesc = `Đây là mô tả chi tiết cho phiên bản **${optionName}** của ${pName}.

Phiên bản **${optionName}** này mang đến những trải nghiệm khác biệt hoàn toàn với các tinh chỉnh về thẩm mỹ và chất lượng hoàn thiện. Hệ thống khớp nối và nước sơn được tối ưu hóa để đảm bảo độ bền và vẻ đẹp lung linh nhất trong tủ kính của bạn.

**Đặc điểm nổi bật của ${optionName}:**
* Thiết kế độc quyền dành riêng cho dòng ${optionName}.
* Độ chi tiết cao hơn 15% so với bản thông thường.
* Đi kèm phụ kiện đặc biệt chỉ có trong gói này.

**Thông số kỹ thuật:**
* **Phiên bản:** ${optionName}
* **Trọng lượng:** ${randomInt(200, 1500)}g
* **Chất liệu:** High-quality PVC & ABS
* **Scale:** 1/12`;

      const rawVPrice = basePrice + (vIdx * basePrice * 0.1);
      const vPrice = Math.round(rawVPrice / 1000) * 1000;
      const vCost = Math.round((vPrice * 0.7) / 1000) * 1000;
      
      await prisma.product_variants.create({
        data: {
          product_id: product.product_id,
          sku: genSku(`SKU-${template.brand.substring(0, 3).toUpperCase()}`, i * 10 + vIdx),
          barcode: genSku('BAR', i * 10 + vIdx),
          option_name: optionName,
          description: variantDesc, // Nạp vào bảng product_variants
          price: vPrice,
          cost_price: vCost,
          stock_available: randomInt(10, 100),
          stock_defect: randomInt(0, 5),
          weight_g: randomInt(200, 1500),
          length_cm: 20, width_cm: 20, height_cm: 20,
          media_assets: JSON.stringify([]),
        }
      });
      variantTotal++;
    }
    
    if (i % 20 === 0) console.log(`  - Đã tạo ${i} sản phẩm...`);
  }

  // ── 3. TOPUP WALLET (CHO TẤT CẢ USER ROLE CUSTOMER) ──────────────────────────
  const customers = await prisma.users.findMany({
    where: { role_code: 'CUSTOMER' }
  });

  console.log(`\n💳 Đang nạp tiền cho ${customers.length} khách hàng...`);
  for (const u of customers) {
    await prisma.wallets.upsert({
      where: { user_id: u.user_id },
      update: { balance_available: { increment: 50000000 } },
      create: { user_id: u.user_id, balance_available: 50000000, balance_locked: 0 }
    });
  }

  console.log(`\n🎉 TẤT CẢ HOÀN TẤT! 100 sản phẩm với ${variantTotal} variants đã sẵn sàng.`);
}

main()
  .catch((e) => { console.error(e); throw e; })
  .finally(async () => { await prisma.$disconnect(); });
