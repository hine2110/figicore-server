import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting Seed: AI Inventory Analytics Mock Data...');

  // 1. KỊCH BẢN 1: Cấu hình OPEX (Operational Expenditure)
  // AI sẽ dựa vào đây để tính điểm hòa vốn (Break-even Price)
  await prisma.system_settings.upsert({
    where: { key: 'OPEX_CONFIG' },
    update: {},
    create: {
      key: 'OPEX_CONFIG',
      value: {
        marketing_pct: 10,
        staff_pct: 10,
        storage_pct: 5,
        risk_pct: 3,
        tax_pct: 0,
      },
      description: 'Cấu hình chi phí vận hành cho AI Testing',
    },
  });
  console.log('✅ Step 1: OPEX Config injected (Total: 28%)');

  // Chuẩn bị một User để gán đơn hàng
  const testUser = await prisma.users.upsert({
    where: { email: 'analytics_tester@figicore.com' },
    update: {},
    create: {
      email: 'analytics_tester@figicore.com',
      full_name: 'AI Analytics Tester',
      role_code: 'MANAGER',
      status_code: 'ACTIVE',
    },
  });

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 15); // Đơn hàng cách đây 15 ngày

  // 2. KỊCH BẢN 2: Xả kho (CLEARANCE) - Sản phẩm ế, tồn kho cực cao
  // Skullpanda City of Night: Tồn 150 con, 0 đơn hàng trong 30 ngày.
  const clearanceProduct = await prisma.products.create({
    data: {
      name: 'Skullpanda City of Night',
      type_code: 'RETAIL',
      status_code: 'ACTIVE',
      product_variants: {
        create: {
          sku: 'SP-CITY-CLEARANCE',
          option_name: 'Full Box Set',
          cost_price: 500000,
          price: 1200000,
          stock_available: 150, // Tồn kho rất cao
          weight_g: 500,
        },
      },
    },
    include: { product_variants: true },
  });
  console.log('✅ Step 2: Clearance Product created (Skullpanda - High Stock)');

  // 3. KỊCH BẢN 3: Nhập gấp (RESTOCK) - Sản phẩm hot, tồn cực thấp
  // Hirono V1: Tồn 5 con, nhưng bán 20 con trong 30 ngày qua.
  const restockProduct = await prisma.products.create({
    data: {
      name: 'Hirono V1',
      type_code: 'RETAIL',
      status_code: 'ACTIVE',
      product_variants: {
        create: {
          sku: 'HR-V1-RESTOCK',
          option_name: 'Single Box',
          cost_price: 450000,
          price: 900000,
          stock_available: 5, // Tồn kho sắp hết
          weight_g: 200,
        },
      },
    },
    include: { product_variants: true },
  });
  const restockVariant = restockProduct.product_variants[0];

  // Tạo dữ liệu bán hàng cho Hirono để AI thấy nó "Hot"
  await prisma.orders.create({
    data: {
      order_code: `SEED-AI-${Date.now()}`,
      user_id: testUser.user_id,
      channel_code: 'POS',
      status_code: 'COMPLETED',
      total_amount: 18000000, // 20 units * 900k
      created_at: thirtyDaysAgo,
      order_items: {
        create: {
          variant_id: restockVariant.variant_id,
          quantity: 20, // Bán nhiều gấp 4 lần tồn kho hiện tại
          unit_price: 900000,
          total_price: 18000000,
        },
      },
    },
  });
  console.log('✅ Step 3: Restock Product created (Hirono - Low Stock & High Sales)');

  console.log('🏁 Seed Analytics completed! You can now run the AI Deep Scan.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
