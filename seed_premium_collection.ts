import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// ─── HELPER ──────────────────────────────────────────────────────────────────
const genSku = (prefix: string, idx: number) =>
  `${prefix}-${Date.now()}-${idx}`;

const vnd = (n: number) => n.toLocaleString('vi-VN') + ' VND';

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('💎 BẮT ĐẦU NẠP DỮ LIỆU BỘ SƯU TẬP CAO CẤP (PREMIUM COLLECTIBLES)...');

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
  console.log('🗑️  Đã xóa sạch dữ liệu cũ!');

  // ── 1. Setup Brands & Categories (Luxury Focus) ──────────────────────────
  const categoryDefs = ['Statue (Resin)', 'Metal Figure', 'Premium Model Kit', 'Life-size Collectibles', 'Fine Art Bust'];
  const brandDefs = [
    'Prime 1 Studio', 'XM Studios', 'Queen Studios', 'JND Studios', 
    'Bandai Spirit (Metal Build)', 'Soul of Chogokin', 'Tsume Art', 
    'Iron Studios', 'Sideshow Collectibles', 'Oniri Creations'
  ];

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

  // ── 2. DATA GENERATOR (100 PREMIUM PRODUCTS) ───────────────────────────────
  const statueTemplates = [
    { name: 'Batman {suffix}', brand: 'Prime 1 Studio', cat: 'Statue (Resin)', price: 25000000 },
    { name: 'Iron Man Mark {num}', brand: 'Queen Studios', cat: 'Fine Art Bust', price: 45000000 },
    { name: 'Goku {suffix}', brand: 'Tsume Art', cat: 'Statue (Resin)', price: 18000000 },
    { name: 'Wonder Woman {suffix}', brand: 'JND Studios', cat: 'Statue (Resin)', price: 65000000 },
    { name: 'Magneto {suffix}', brand: 'XM Studios', cat: 'Statue (Resin)', price: 35000000 },
    { name: 'Metal Build {name}', brand: 'Bandai Spirit (Metal Build)', cat: 'Metal Figure', price: 6500000 },
    { name: 'Soul of Chogokin DX {name}', brand: 'Soul of Chogokin', cat: 'Metal Figure', price: 12000000 },
    { name: 'Perfect Grade Unleashed {name}', brand: 'Bandai Spirit (Metal Build)', cat: 'Premium Model Kit', price: 5500000 },
    { name: 'Thanos {suffix}', brand: 'Iron Studios', cat: 'Statue (Resin)', price: 22000000 },
    { name: 'Spider-Man {suffix}', brand: 'Sideshow Collectibles', cat: 'Statue (Resin)', price: 15000000 },
  ];

  const suffixes = ['The Dark Knight Edition', 'Museum Masterline', 'Premium Format', 'Legacy Series', 'Artist Proof', 'Royal Selection', 'Concept Masterline', 'Supreme Edition', 'Omega Release', 'Infinity War Ver.', 'HQS Plus', 'Silicone Skin Edition'];
  const mechaNames = ['Strike Freedom', 'Destiny Gundam', 'Mazinger Z', 'Gundam Exia', 'Hi-Nu Gundam', 'Sazabi Ver.Ka', 'Voltes V', 'Combattler V'];

  console.log('📦 Đang tạo 100 tác phẩm nghệ thuật sưu tầm...');

  let variantTotal = 0;
  for (let i = 1; i <= 100; i++) {
    const template = statueTemplates[randomInt(0, statueTemplates.length - 1)];
    const suffix = template.name.includes('{name}') 
      ? mechaNames[randomInt(0, mechaNames.length - 1)] 
      : suffixes[randomInt(0, suffixes.length - 1)];
    
    const pName = template.name.replace('{suffix}', suffix).replace('{num}', randomInt(1, 85).toString()).replace('{name}', suffix) + ` (Studio Batch #${i})`;
    
    const basePrice = Math.round((template.price + randomInt(-2000000, 5000000)) / 100000) * 100000;

    const product = await prisma.products.create({
      data: {
        name: pName,
        type_code: 'RETAIL',
        status_code: 'ACTIVE',
        category_id: catMap.get(template.cat),
        brand_id: brandMap.get(template.brand),
        description: `Chào mừng bạn đến với tác phẩm nghệ thuật **${pName}**. Đây không chỉ là một mô hình, mà là một di sản sưu tầm được chế tác bởi các nghệ nhân hàng đầu thế giới từ ${template.brand}. Mọi chi tiết từ màu sơn, chất liệu đến cảm xúc nhân vật đều được tái hiện ở mức độ hoàn hảo nhất. Hãy chọn các phiên bản bên dưới để xem chi tiết thông số kỹ thuật và các phụ kiện độc quyền đi kèm.`,
        media_urls: [],
      }
    });

    const numVariants = randomInt(2, 3);
    for (let vIdx = 0; vIdx < numVariants; vIdx++) {
      let optionName = 'Standard Collector';
      let priceAdd = 0;
      let exclusiveFeat = '';

      if (vIdx === 1) {
        optionName = 'Deluxe Edition (LED + Swappable Parts)';
        priceAdd = basePrice * 0.3;
        exclusiveFeat = 'Tích hợp hệ thống đèn LED thông minh, 3 đầu thay thế khác nhau và base trưng bày có hiệu ứng đặc biệt.';
      } else if (vIdx === 2) {
        optionName = 'Ultimate Exclusive (Silicone Skin + Real Hair)';
        priceAdd = basePrice * 0.8;
        exclusiveFeat = 'Phiên bản cao cấp nhất với da bằng Silicone y tế, tóc thật cấy thủ công và giấy chứng nhận có chữ ký trực tiếp từ giám đốc sáng tạo Studio.';
      }

      const vPrice = Math.round((basePrice + priceAdd) / 100000) * 100000;
      const vCost = Math.round((vPrice * 0.6) / 100000) * 100000;

      // AI Format Variant Description
      const vDescription = `Tác phẩm: **${pName}**
Phiên bản: **${optionName}**

Đây là sự lựa chọn tối thượng dành cho các nhà sưu tầm chuyên nghiệp. Phiên bản **${optionName}** được xưởng ${template.brand} giới hạn số lượng cực thấp trên toàn cầu. ${exclusiveFeat} 

Mỗi chi tiết nhỏ nhất như vết trầy xước trên giáp hay nếp nhăn trên vải đều được các nghệ nhân sơn tay tỉ mỉ bằng công nghệ sơn đa lớp cao cấp, mang lại chiều sâu thị giác không thể nhầm lẫn với hàng phổ thông.

**Thông số kỹ thuật của ${optionName}:**
* **Xưởng sản xuất:** ${template.brand}
* **Tỉ lệ:** ${template.cat === 'Fine Art Bust' ? '1/1 (Bust)' : (template.cat === 'Life-size Collectibles' ? '1/1' : (randomInt(0, 1) ? '1/4' : '1/3'))}
* **Chất liệu:** Polystone cao cấp, Resin, Da thật, Vải thủ công, Silicone
* **Trọng lượng:** ${randomInt(10, 50)}kg (Solid structure)
* **Kích thước:** Cao ${randomInt(40, 100)}cm x Rộng ${randomInt(30, 80)}cm
* **Phụ kiện:** Full Box, Art-print, Chứng nhận COA (Certificate of Authenticity)`;

      await prisma.product_variants.create({
        data: {
          product_id: product.product_id,
          sku: genSku(`SKU-${template.brand.substring(0, 3).toUpperCase()}`, i * 10 + vIdx),
          barcode: genSku('BAR', i * 10 + vIdx),
          option_name: optionName,
          description: vDescription,
          price: vPrice,
          cost_price: vCost,
          stock_available: randomInt(1, 10), // Hàng hiếm thì tồn kho ít
          stock_defect: 0,
          weight_g: randomInt(5000, 25000),
          length_cm: 40, width_cm: 40, height_cm: 80,
          scale: 'Premium Scale',
          material: 'Polystone / Resin / Silicone',
          media_assets: JSON.stringify([]),
        }
      });
      variantTotal++;
    }
    
    if (i % 20 === 0) console.log(`  ✔ Đã hoàn tất ${i} siêu phẩm...`);
  }

  // ── 3. TOPUP WALLET (ONLY CUSTOMERS) ───────────────────────────────────────
  const customers = await prisma.users.findMany({ where: { role_code: 'CUSTOMER' } });
  console.log(`\n💳 Cấp vốn cho ${customers.length} nhà sưu tầm (CUSTOMER)...`);
  for (const u of customers) {
    await prisma.wallets.upsert({
      where: { user_id: u.user_id },
      update: { balance_available: { increment: 500000000 } }, // Tặng 500 Triệu cho đại gia sưu tầm
      create: { user_id: u.user_id, balance_available: 500000000, balance_locked: 0 }
    });
  }

  console.log(`\n🎉 SEED HOÀN TẤT! 100 siêu phẩm với ${variantTotal} phiên bản đã sẵn sàng.`);
}

main()
  .catch((e) => { console.error(e); throw e; })
  .finally(async () => { await prisma.$disconnect(); });
