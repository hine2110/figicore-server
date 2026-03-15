const { PrismaClient } = require('@prisma/client');
const dayjs = require('dayjs');
const prisma = new PrismaClient();

async function seedEverything() {
  console.log('======================================================');
  console.log('🚀 ĐANG NẠP DỮ LIỆU TEST AI TOÀN DIỆN (6 KỊCH BẢN) 🚀');
  console.log('======================================================\n');

  // 1. Kiểm tra User
  const user = await prisma.users.findFirst({ select: { user_id: true } });
  if (!user) {
    console.log('❌ Lỗi: Không tìm thấy người dùng nào trong CSDL để tạo đơn.');
    process.exit(1);
  }
  const userId = user.user_id;

  // 2. Lấy danh sách sản phẩm và biến thể
  const products = await prisma.products.findMany({ 
    include: { product_variants: true },
    take: 6 // Chúng ta cần tối đa 6 sản phẩm cho 6 kịch bản
  });
  
  if (products.length === 0) {
    console.log('❌ Lỗi: Bạn chưa tạo sản phẩm nào.');
    process.exit(1);
  }

  console.log('🧹 Đang dọn dẹp các đề xuất AI cũ và đơn hàng SEED-AI...');
  // Xóa các khuyến nghị cũ để AI tính lại từ đầu
  await prisma.system_recommendations.deleteMany({ where: { status_code: 'PENDING' } });
  
  // Xóa các đơn hàng đã seed trước đó để không bị trùng lặp dữ liệu
  await prisma.order_items.deleteMany({
    where: { 
        orders: { order_code: { startsWith: 'SEED-AI-' } }
    }
  });
  await prisma.orders.deleteMany({
    where: { order_code: { startsWith: 'SEED-AI-' } }
  });

  const SCENARIOS = [
    {
      name: "🔥 TRƯỜNG HỢP 1: URGENT RESTOCK (Cháy hàng - Bán cực chạy, tồn kho sắp hết)",
      stock: 10,
      setupSales: async (vId, price) => {
        // Tốc độ bán: 5 sản phẩm/ngày trong 30 ngày (Tổng 150 cái)
        for (let d = 0; d < 30; d++) {
          await createOrder(vId, 5, dayjs().subtract(d, 'days').toDate(), price, userId);
        }
      }
    },
    {
      name: "❄️ TRƯỜNG HỢP 2: CLEARANCE (Xả kho - Hàng chết, tồn nhiều, không ai mua)",
      stock: 100,
      setupSales: async (vId, price) => {
        // Không tạo đơn nào trong 30 ngày qua
        console.log(`   -> Giữ nguyên 0 doanh số cho hàng chết.`);
      }
    },
    {
      name: "🐢 TRƯỜNG HỢP 3: DISCOUNT (Kích cầu - Bán rải rác, tồn kho dư thừa)",
      stock: 50,
      setupSales: async (vId, price) => {
        // Cứ 3 ngày mới có 1 đơn (Tổng 10 đơn/tháng)
        for (let d = 0; d < 30; d += 3) {
          await createOrder(vId, 1, dayjs().subtract(d, 'days').toDate(), price, userId);
        }
      }
    },
    {
      name: "📈 TRƯỜNG HỢP 4: TRENDING (Lên xu hướng - Momentum cao, cần nhập gấp)",
      stock: 30,
      setupSales: async (vId, price) => {
        // 3 tuần đầu lẹt đẹt: 1 đơn/ngày
        for (let d = 8; d < 30; d++) {
          await createOrder(vId, 1, dayjs().subtract(d, 'days').toDate(), price, userId);
        }
        // Tuần gần nhất bùng nổ: 10 đơn/ngày
        for (let d = 0; d < 7; d++) {
          await createOrder(vId, 10, dayjs().subtract(d, 'days').toDate(), price, userId);
        }
      }
    },
    {
      name: "✅ TRƯỜNG HỢP 5: STABLE (Ổn định - Tồn kho dồi dào, bán đều đặn)",
      stock: 60,
      setupSales: async (vId, price) => {
        // Bán đều vắt tranh 2 đơn/ngày (Tổng 60 đơn/tháng)
        // Với tồn 60 -> Days of Health = 30 ngày -> An toàn
        for (let d = 0; d < 30; d++) {
          await createOrder(vId, 2, dayjs().subtract(d, 'days').toDate(), price, userId);
        }
      }
    },
    {
      name: "📉 TRƯỜNG HỢP 6: DROPPING (Mất nhiệt - Momentum âm, cần đẩy hàng gấp)",
      stock: 80,
      setupSales: async (vId, price) => {
        // 3 tuần đầu bán rất tốt: 5 đơn/ngày
        for (let d = 8; d < 30; d++) {
          await createOrder(vId, 5, dayjs().subtract(d, 'days').toDate(), price, userId);
        }
        // Tuần gần nhất rớt thảm: 0-1 đơn/ngày
        for (let d = 0; d < 7; d++) {
          if (d % 2 === 0) await createOrder(vId, 1, dayjs().subtract(d, 'days').toDate(), price, userId);
        }
      }
    }
  ];

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const variants = p.product_variants;
    if (variants.length === 0) continue;

    // Chọn kịch bản (lặp lại nếu có hơn 6 sản phẩm)
    const scenario = SCENARIOS[i % SCENARIOS.length];

    console.log(`\n📦 Sản phẩm ${i+1}: [${p.name}]`);
    console.log(`🎬 Kịch bản: ${scenario.name}`);

    for (const v of variants) {
        // Cập nhật tồn kho thực tế cho biến thể
        await prisma.product_variants.update({ 
          where: { variant_id: v.variant_id }, 
          data: { stock_available: scenario.stock } 
        });

        // Tạo lịch sử bán hàng theo kịch bản
        await scenario.setupSales(v.variant_id, v.price);
        
        console.log(`   + Biến thể [${v.option_name}]: Reset Stock = ${scenario.stock}, đã tạo lịch sử bán hàng.`);
    }
  }

  console.log('\n======================================================');
  console.log('✅ ĐÃ NẠP XONG DỮ LIỆU TEST!');
  console.log('👉 Bây giờ bạn có thể chạy chức năng AI để kiểm tra đề xuất.');
  console.log('======================================================');
}

async function createOrder(variantId, qty, date, price, userId) {
    const randomSuffix = Math.floor(Math.random() * 1000000);
    const orderCode = `SEED-AI-${date.getTime()}-${randomSuffix}`;
    
    // Tạo đơn hàng đã hoàn thành
    const order = await prisma.orders.create({
        data: {
            order_code: orderCode,
            user_id: userId,
            channel_code: 'STORE',
            total_amount: Number(price) * qty,
            status_code: 'COMPLETED',
            created_at: date,
            updated_at: date
        }
    });

    // Tạo chi tiết đơn hàng
    await prisma.order_items.create({
        data: {
            order_id: order.order_id,
            variant_id: variantId,
            quantity: qty,
            unit_price: price,
            total_price: Number(price) * qty,
            tax_rate: 0
        }
    });
}

seedEverything()
  .catch(e => {
    console.error('❌ Lỗi khi thực hiện seed:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
