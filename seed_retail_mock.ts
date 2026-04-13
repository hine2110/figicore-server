import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── HELPER ──────────────────────────────────────────────────────────────────
const genSku = (prefix: string, idx: number) =>
  `${prefix}-${Date.now()}-${idx}`;

const vnd = (n: number) => n.toLocaleString('vi-VN') + ' VND';

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 BẮT ĐẦU DỌN DẸP VÀ NẠP DỮ LIỆU RETAIL MỚI...');

  // ── 0. Xóa dữ liệu cũ (child → parent để tránh FK error) ──────────────────
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
  await prisma.auctions.deleteMany();            // references product_variants
  await prisma.product_blindboxes.deleteMany();
  await prisma.product_preorder_configs.deleteMany();
  await prisma.product_variants.deleteMany();
  await prisma.products.deleteMany();
  console.log('🗑️  Đã xóa sạch dữ liệu sản phẩm cũ!');

  // ── 1. Upsert Brands & Categories ─────────────────────────────────────────
  const categoryDefs = [
    'Model Kits',
    'Action Figures',
    'Art Toys',
    'Professional Tools',
    'Modeling Supplies',
    'Display Accessories',
  ];

  const brandDefs = [
    'Bandai',
    'Moshow Toys',
    'Motor Nuclear',
    'ThreeZero',
    'Hot Toys',
    'Good Smile Company',
    'Tamiya',
    'Mr. Hobby',
    'Pop Mart',
    'Kidslogic',
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

  console.log(`✅ [SETUP] ${catMap.size} danh mục / ${brandMap.size} thương hiệu sẵn sàng.`);

  // ── 2. Định nghĩa sản phẩm RETAIL ─────────────────────────────────────────
  // description tuân thủ format AI:
  //   - 2-3 đoạn marketing tiếng Việt, giọng dân chơi
  //   - Kết thúc = "**Thông số kỹ thuật:**" + bullet points
  // Mỗi variant: stock_available (hàng tốt), stock_defect (hàng lỗi)

  const products = [
    // ────────────────────────────────────────────────────────────────
    // MODEL KITS
    // ────────────────────────────────────────────────────────────────
    {
      name: 'PG Unleashed RX-78-2 Gundam',
      brand: 'Bandai',
      cat: 'Model Kits',
      status_code: 'ACTIVE',
      description: `PG Unleashed RX-78-2 là đỉnh cao tuyệt đối của dòng Perfect Grade từ Bandai — một cột mốc không thể bỏ qua với bất kỳ dân chơi Gunpla nào. Khung nội thất kim loại chi tiết đến từng khớp, lớp giáp ngoài bằng nhựa ABS cao cấp kết hợp với LED system tích hợp tạo ra một model kit vừa đẹp để trưng bày vừa có chiều sâu khi tháo lắp.

Tỉ lệ 1/60 cho phép thể hiện trọn vẹn toàn bộ internal frame phức tạp, hệ thống khớp đa chiều mô phỏng chuyển động thực tế của Mobile Suit. Bộ sản phẩm đi kèm beam rifle, shield, beam saber — đủ để đặt pose iconic nhất trong lịch sử Gundam.

**Thông số kỹ thuật:**
* **Thương hiệu:** Bandai
* **Tỉ lệ:** 1/60
* **Chất liệu:** ABS, PS, PE, AES, Diecast, LED Unit
* **Phụ kiện:** Beam Rifle, Shield, Beam Sabers (×2), Core Fighter, Stand
* **Giá tham khảo:** ${vnd(6500000)}`,
      variants: [
        {
          option_name: 'Standard Edition',
          price: 6500000,
          cost_price: 4550000,
          stock_available: 12,
          stock_defect: 1,
          weight_g: 1800,
          length_cm: 45, width_cm: 35, height_cm: 20,
          scale: '1/60',
          material: 'ABS / PS / PE / Diecast',
        },
        {
          option_name: 'Premium Gloss Coating',
          price: 7800000,
          cost_price: 5460000,
          stock_available: 4,
          stock_defect: 0,
          weight_g: 1900,
          length_cm: 45, width_cm: 35, height_cm: 20,
          scale: '1/60',
          material: 'ABS / PS / PE / Diecast (Gloss)',
        },
      ],
    },

    {
      name: 'MG Ver.Ka Unicorn Gundam',
      brand: 'Bandai',
      cat: 'Model Kits',
      status_code: 'ACTIVE',
      description: `Unicorn Gundam Ver.Ka từ Bandai là tác phẩm hợp tác giữa Hajime Katoki và Yoshiyuki Tomino, mang đến một model kit Master Grade hoàn hảo với hệ thống chuyển đổi Unicorn Mode ↔ Destroy Mode cực kỳ mượt mà. Lớp giáp trắng tinh khiết có thể tách ra để lộ ra skeleton đỏ rực rỡ bên trong — visual contrast stunning không đâu có được.

Panel line đã được pre-defined sắc nét, runner selection chia màu chuẩn xác nên build có thể đẹp ngay cả khi không topcoat. Đặc biệt phiên bản Ver.Ka đi kèm booklet design từ chính Katoki, cực quý với fan hardcore.

**Thông số kỹ thuật:**
* **Thương hiệu:** Bandai
* **Tỉ lệ:** 1/100
* **Chất liệu:** ABS, PS, PE, Foil Stickers
* **Phụ kiện:** Beam Magnum, Hyper Bazooka, Shield, Beam Sabers, Effect Parts
* **Giá tham khảo:** ${vnd(1850000)}`,
      variants: [
        {
          option_name: 'Standard White',
          price: 1850000,
          cost_price: 1295000,
          stock_available: 25,
          stock_defect: 2,
          weight_g: 600,
          length_cm: 30, width_cm: 20, height_cm: 12,
          scale: '1/100',
          material: 'ABS / PS / PE',
        },
        {
          option_name: 'Full Psycho-Frame (Clear Red)',
          price: 2400000,
          cost_price: 1680000,
          stock_available: 8,
          stock_defect: 0,
          weight_g: 650,
          length_cm: 30, width_cm: 20, height_cm: 12,
          scale: '1/100',
          material: 'ABS / PS / PE / Clear',
        },
      ],
    },

    {
      name: 'RG Crossbone Gundam X1',
      brand: 'Bandai',
      cat: 'Model Kits',
      status_code: 'ACTIVE',
      description: `Crossbone X1 ở tỉ lệ Real Grade — đây là mẫu Gunpla hiếm hoi khiến cộng đồng build chờ đợi suốt nhiều năm. Thiết kế pirate aesthetic độc đáo với cờ chéo và skull motif trên giáp, beam zanber siêu dài và screw whip đặc trưng tạo nên silhouette không thể nhầm lẫn.

Advanced MS Joint System của RG series cho phép độ linh hoạt khớp vượt trội so với bất kỳ scale nào dưới 1/100. Full markings decal đi kèm giúp model trông professional chỉ sau vài tiếng build cơ bản — perfect cho cả newbie lẫn veteran.

**Thông số kỹ thuật:**
* **Thương hiệu:** Bandai
* **Tỉ lệ:** 1/144
* **Chất liệu:** ABS, PS, PE
* **Phụ kiện:** Beam Zanber, Screw Whip, Heat Dagger, Brand Marker, Muramasa Blaster
* **Giá tham khảo:** ${vnd(750000)}`,
      variants: [
        {
          option_name: 'Standard Release',
          price: 750000,
          cost_price: 525000,
          stock_available: 40,
          stock_defect: 3,
          weight_g: 180,
          length_cm: 22, width_cm: 15, height_cm: 8,
          scale: '1/144',
          material: 'ABS / PS / PE',
        },
        {
          option_name: 'Special Coating Ver.',
          price: 950000,
          cost_price: 665000,
          stock_available: 10,
          stock_defect: 1,
          weight_g: 185,
          length_cm: 22, width_cm: 15, height_cm: 8,
          scale: '1/144',
          material: 'ABS / PS / PE (Pre-coated)',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────
    // ACTION FIGURES
    // ────────────────────────────────────────────────────────────────
    {
      name: 'Metal Build Strike Freedom Gundam',
      brand: 'Bandai',
      cat: 'Action Figures',
      status_code: 'ACTIVE',
      description: `Metal Build Strike Freedom — một trong những figure đỉnh cao nhất mà Bandai từng sản xuất. Toàn bộ khung thân diecast hợp kim tạo nên trọng lượng và độ bền đặc trưng của dòng Metal Build, trong khi lớp phủ pearl gold trên các chi tiết giáp tạo ra hiệu ứng ánh sáng cực kỳ sang trọng dưới ánh đèn showcase.

Cánh đôi DRAGOON System có thể mở hoàn toàn ra tạo silhouette imposing reach gần 60cm khi extended, đi kèm beam effect parts cho màn trình diễn show-stopping. Mỗi chiếc figure qua 3 lần kiểm tra QC nghiêm ngặt trước khi xuất xưởng.

**Thông số kỹ thuật:**
* **Thương hiệu:** Bandai (Metal Build Series)
* **Tỉ lệ:** 1/100
* **Chất liệu:** Diecast (ABS, PVC body)
* **Phụ kiện:** Twin Beam Rifles, Dual Beam Sabers, DRAGOON System, Beam Effect Parts, Display Stand
* **Giá tham khảo:** ${vnd(5200000)}`,
      variants: [
        {
          option_name: 'Standard Edition',
          price: 5200000,
          cost_price: 3640000,
          stock_available: 8,
          stock_defect: 1,
          weight_g: 900,
          length_cm: 35, width_cm: 30, height_cm: 15,
          scale: '1/100',
          material: 'Diecast / ABS / PVC',
        },
        {
          option_name: 'Soul Blue Edition (Limited)',
          price: 6500000,
          cost_price: 4550000,
          stock_available: 2,
          stock_defect: 0,
          weight_g: 920,
          length_cm: 35, width_cm: 30, height_cm: 15,
          scale: '1/100',
          material: 'Diecast / ABS / PVC (Metallic Blue)',
        },
      ],
    },

    {
      name: 'Moshow Toys Takeda Shingen Deluxe',
      brand: 'Moshow Toys',
      cat: 'Action Figures',
      status_code: 'ACTIVE',
      description: `Takeda Shingen từ Moshow Toys là đại diện xuất sắc nhất của dòng Metal Build origin Trung Quốc — nơi trọng lượng thực sự kim loại gặp thiết kế kiếm hiệp oai hùng. Bộ giáp samurai được mô phỏng tỉ mỉ từng chi tiết, từ hoa văn trên mũ kabuto đến chuỗi hạt kaidan-do armor lớp lớp chắc chắn.

Cặp katana đi kèm có thể rút ra khỏi vỏ đựng thực sự trên lưng figure, các khớp ball-joint diecast cho phép đặt pose chiến đấu cực dynamic. Phiên bản Deluxe bổ sung thêm bộ weapon pack và display base cao cấp có in logo.

**Thông số kỹ thuật:**
* **Thương hiệu:** Moshow Toys
* **Tỉ lệ:** ~1/9
* **Chất liệu:** Diecast Alloy / PVC / ABS
* **Phụ kiện:** Dual Katana, Naginata, Spear, Wakizashi, Hand Parts Set, Display Base
* **Giá tham khảo:** ${vnd(3250000)}`,
      variants: [
        {
          option_name: 'Standard Edition',
          price: 3250000,
          cost_price: 2275000,
          stock_available: 10,
          stock_defect: 0,
          weight_g: 1100,
          length_cm: 32, width_cm: 22, height_cm: 18,
          scale: '1/9',
          material: 'Diecast / PVC / ABS',
        },
        {
          option_name: 'Deluxe Weapon Pack',
          price: 3900000,
          cost_price: 2730000,
          stock_available: 5,
          stock_defect: 1,
          weight_g: 1250,
          length_cm: 38, width_cm: 28, height_cm: 20,
          scale: '1/9',
          material: 'Diecast / PVC / ABS + Extra Weapons',
        },
      ],
    },

    {
      name: 'ThreeZero DLX Iron Man Mark 50',
      brand: 'ThreeZero',
      cat: 'Action Figures',
      status_code: 'ACTIVE',
      description: `Mark 50 — Nano-suit của Tony Stark trong Avengers: Infinity War — được ThreeZero tái hiện hoàn hảo qua dòng DLX với hơn 50 điểm articulation trên toàn thân. Chất liệu ABS cao cấp phủ lớp sơn metallic red-gold mô phỏng chính xác màu sắc on-screen, LED tích hợp tại chest arc reactor và cặp mắt có thể bật tắt qua nút nhấn ẩn.

Hệ thống Nano-particle effect parts đi kèm cho phép tái hiện nhiều cảnh iconic: fist blast, repulsor ray, và thậm chí partial transformation. Figure hoàn toàn stand-alone không cần stand nhờ khớp ankle ổn định, nhưng display stand vẫn đính kèm để pose dynamic.

**Thông số kỹ thuật:**
* **Thương hiệu:** ThreeZero (DLX Series)
* **Tỉ lệ:** 1/12
* **Chất liệu:** ABS, PVC, LED Module
* **Phụ kiện:** Repulsor Blast Parts, Hand Set (×6 pairs), Display Stand, Nano Weapon Effects
* **Giá tham khảo:** ${vnd(2450000)}`,
      variants: [
        {
          option_name: 'Standard Edition',
          price: 2450000,
          cost_price: 1715000,
          stock_available: 18,
          stock_defect: 2,
          weight_g: 450,
          length_cm: 28, width_cm: 20, height_cm: 12,
          scale: '1/12',
          material: 'ABS / PVC / LED',
        },
        {
          option_name: 'Battle Damage War Machine Combo',
          price: 3800000,
          cost_price: 2660000,
          stock_available: 4,
          stock_defect: 0,
          weight_g: 850,
          length_cm: 40, width_cm: 30, height_cm: 18,
          scale: '1/12',
          material: 'ABS / PVC / LED (Combo Set)',
        },
      ],
    },

    {
      name: 'Hot Toys MMS606 Spider-Man (No Way Home)',
      brand: 'Hot Toys',
      cat: 'Action Figures',
      status_code: 'ACTIVE',
      description: `Hot Toys MMS606 tái hiện Peter Parker phiên bản Integrated Suit từ bom tấn Spider-Man: No Way Home với độ trung thực đáng kinh ngạc ở tỉ lệ 1/6. Đầu sculpt được likeness-approved bởi Tom Holland, mái tóc rooted thực sự và đôi mắt kính spandex suit có thể thay đổi biểu cảm thông qua LED bên trong.

Suit vải may tay tỉ mỉ bằng chính xác chất liệu như trong phim, dây web shooter bằng kim loại thực và web strand accessories tạo pose swing cực chân thực. LED trong ngực có thể lập trình các pattern sáng khác nhau — figure này là collector's item để đời.

**Thông số kỹ thuật:**
* **Thương hiệu:** Hot Toys
* **Tỉ lệ:** 1/6
* **Chất liệu:** Fabric Suit, Diecast Internal Frame, Silicone Head Sculpt
* **Phụ kiện:** Web Strand (×4), Web Shooter, Hand Set (×8), LED Chest Arc, Figure Stand
* **Giá tham khảo:** ${vnd(7800000)}`,
      variants: [
        {
          option_name: 'Standard Edition',
          price: 7800000,
          cost_price: 5460000,
          stock_available: 5,
          stock_defect: 0,
          weight_g: 1200,
          length_cm: 40, width_cm: 25, height_cm: 20,
          scale: '1/6',
          material: 'Fabric / Diecast / Silicone',
        },
        {
          option_name: 'Deluxe Version (Bonus Accessories)',
          price: 9200000,
          cost_price: 6440000,
          stock_available: 2,
          stock_defect: 0,
          weight_g: 1350,
          length_cm: 45, width_cm: 30, height_cm: 22,
          scale: '1/6',
          material: 'Fabric / Diecast / Silicone (Deluxe)',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────
    // ART TOYS
    // ────────────────────────────────────────────────────────────────
    {
      name: 'Pop Mart SKULLPANDA Rave Baby Series',
      brand: 'Pop Mart',
      cat: 'Art Toys',
      status_code: 'ACTIVE',
      description: `SKULLPANDA — nhân vật signature của Ziqi Pan — tiếp tục gây sốt tại Việt Nam với series Rave Baby. Mỗi figure mang phong cách underground music culture pha trộn kawaii gothic, màu sắc neon vibrant dưới đèn blacklight tạo hiệu ứng glow cực ảo. Đây là series collectible sold separately, mỗi hộp chứa một figure ngẫu nhiên.

Chất liệu PVC Soft vinyl cao cấp, paint application multi-layer với texture embossed tinh tế trên trang phục. Secret figure tỉ lệ 1:72 (ultra rare) là cơn ác mộng ngọt ngào của mọi collector — chase figure hunt chính hiệu.

**Thông số kỹ thuật:**
* **Thương hiệu:** Pop Mart × Ziqi Pan
* **Tỉ lệ:** ~1/12 (approx. 12cm)
* **Chất liệu:** Soft PVC (Glow in Dark coating available)
* **Phụ kiện:** Display Base nhỏ, Collector Card
* **Giá tham khảo:** ${vnd(380000)} / hộp`,
      variants: [
        {
          option_name: 'Single Box (Random)',
          price: 380000,
          cost_price: 228000,
          stock_available: 72,
          stock_defect: 0,
          weight_g: 150,
          length_cm: 12, width_cm: 12, height_cm: 14,
          scale: '~1/12',
          material: 'Soft PVC',
        },
        {
          option_name: 'Full Set (12 Boxes — All Variants)',
          price: 4200000,
          cost_price: 2940000,
          stock_available: 6,
          stock_defect: 0,
          weight_g: 1800,
          length_cm: 45, width_cm: 35, height_cm: 18,
          scale: '~1/12',
          material: 'Soft PVC (Complete Set)',
        },
      ],
    },

    {
      name: 'Good Smile Company Nendoroid Rem (Re:Zero)',
      brand: 'Good Smile Company',
      cat: 'Art Toys',
      status_code: 'ACTIVE',
      description: `Rem từ Re:Zero là nhân vật blue-haired waifu iconic nhất anime mấy năm qua — và Good Smile Company đã thổi hồn vào cô ấy qua dòng Nendoroid với phong cách chibi cực cute nhưng vẫn đầy đủ personality. Ba faceplates thay thế cho phép collector tái hiện đủ mọi biểu cảm từ yandere đến soft mode.

Joint system thương hiệu của GSC cực linh hoạt, figure đứng vững không cần stand nhờ bàn chân thiết kế thông minh. Kèm flail morning star weapon và nhiều bàn tay pose — giá tốt cho chất lượng premium của dòng Nendoroid authentic.

**Thông số kỹ thuật:**
* **Thương hiệu:** Good Smile Company
* **Tỉ lệ:** Non-scale (Nendoroid ~10cm)
* **Chất liệu:** ABS, PVC
* **Phụ kiện:** 3× Faceplates, Flail Weapon, Broom, Hand Set, Display Stand
* **Giá tham khảo:** ${vnd(850000)}`,
      variants: [
        {
          option_name: 'Original Ver.',
          price: 850000,
          cost_price: 595000,
          stock_available: 30,
          stock_defect: 2,
          weight_g: 200,
          length_cm: 18, width_cm: 15, height_cm: 10,
          scale: 'Non-scale',
          material: 'ABS / PVC',
        },
        {
          option_name: 'Birthday Ver. (Exclusive Faceplate)',
          price: 980000,
          cost_price: 686000,
          stock_available: 12,
          stock_defect: 1,
          weight_g: 210,
          length_cm: 18, width_cm: 15, height_cm: 10,
          scale: 'Non-scale',
          material: 'ABS / PVC (Limited)',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────
    // PROFESSIONAL TOOLS
    // ────────────────────────────────────────────────────────────────
    {
      name: 'Tamiya Craft Tools Modeler Set Pro',
      brand: 'Tamiya',
      cat: 'Professional Tools',
      status_code: 'ACTIVE',
      description: `Bộ dụng cụ cao cấp của Tamiya được đóng gói chuẩn cho modeler chuyên nghiệp — từ kềm cắt Side-Cutter sắc bén single-blade cho zero gate mark đến bộ cây nhíp và dao cạo đa năng. Tất cả làm từ thép không gỉ chất lượng Nhật, trọng lượng cân bằng giúp tay ít mỏi trong session build dài.

Đặc biệt Side Cutter 74123 của Tamiya vẫn là tiêu chuẩn vàng của ngành — lưỡi cắt single bevel không để lại gate mark thô, clean build từ bước đầu tiên. Nhíp Pointed và Flat Tip xi mạ chống gỉ, lò xo đàn hồi cao cấp.

**Thông số kỹ thuật:**
* **Thương hiệu:** Tamiya
* **Tỉ lệ:** N/A (Công cụ)
* **Chất liệu:** Thép không gỉ cao cấp
* **Phụ kiện:** Side Cutter, Pointed Tweezers, Flat Tweezers, Panel Line Chisel, Sanding Sticks (×4), Craft Knife
* **Giá tham khảo:** ${vnd(650000)}`,
      variants: [
        {
          option_name: 'Standard Set (4 Tools)',
          price: 350000,
          cost_price: 210000,
          stock_available: 50,
          stock_defect: 2,
          weight_g: 250,
          length_cm: 20, width_cm: 12, height_cm: 5,
          scale: 'N/A',
          material: 'Stainless Steel',
        },
        {
          option_name: 'Pro Set (7 Tools + Storage Case)',
          price: 650000,
          cost_price: 390000,
          stock_available: 25,
          stock_defect: 1,
          weight_g: 450,
          length_cm: 26, width_cm: 18, height_cm: 6,
          scale: 'N/A',
          material: 'Stainless Steel + Case',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────
    // MODELING SUPPLIES
    // ────────────────────────────────────────────────────────────────
    {
      name: 'Mr. Hobby Mr. Color Series Paint Set',
      brand: 'Mr. Hobby',
      cat: 'Modeling Supplies',
      status_code: 'ACTIVE',
      description: `Màu sơn Mr. Color từ GSI Creos (Mr. Hobby) là tiêu chuẩn vàng của cộng đồng Gunpla và Scale Model toàn thế giới. Lacquer base cho độ bám dính vượt trội trên nhựa ABS/PS, khô nhanh, cho phép pha loãng để airbrushing mịn màng hoặc hand brushing sắc nét.

Series Gundam Color được pha chế chính xác theo màu specification từ Bandai, đảm bảo anime-accurate color accuracy. Set màu cơ bản bao gồm đủ màu nền, màu shadow và màu highlight để thực hiện kỹ thuật NMM hoặc zenithal priming chuyên nghiệp.

**Thông số kỹ thuật:**
* **Thương hiệu:** Mr. Hobby (GSI Creos)
* **Tỉ lệ:** N/A (Sơn mô hình)
* **Chất liệu:** Lacquer (pha loãng bằng Mr. Thinner)
* **Phụ kiện:** Bộ 10 màu cơ bản (10ml × 10 lọ), tờ hướng dẫn pha màu
* **Giá tham khảo:** ${vnd(320000)} / set`,
      variants: [
        {
          option_name: 'Gundam Starter Set (10 colors)',
          price: 320000,
          cost_price: 192000,
          stock_available: 60,
          stock_defect: 0,
          weight_g: 300,
          length_cm: 18, width_cm: 10, height_cm: 8,
          scale: 'N/A',
          material: 'Lacquer Paint',
        },
        {
          option_name: 'Advanced Metallic Set (6 colors)',
          price: 280000,
          cost_price: 168000,
          stock_available: 40,
          stock_defect: 0,
          weight_g: 180,
          length_cm: 14, width_cm: 10, height_cm: 6,
          scale: 'N/A',
          material: 'Lacquer Paint (Metallic)',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────
    // DISPLAY ACCESSORIES
    // ────────────────────────────────────────────────────────────────
    {
      name: 'Kidslogic Magnetic Floating Display Stand',
      brand: 'Kidslogic',
      cat: 'Display Accessories',
      status_code: 'ACTIVE',
      description: `Stand từ tính nổi của Kidslogic là một trong những display accessories ấn tượng nhất để showcase figure và Gunpla. Công nghệ electromagnetic levitation giữ cho figure lơ lửng và xoay chầm chậm 360° tạo hiệu ứng khác biệt hoàn toàn so với stand thông thường — đặc biệt ở buổi tối khi đèn LED base chiếu sáng từ bên dưới.

Base bằng nhựa ABS cao cấp có LED RGB thay đổi màu tự động, tải trọng tối đa 500g phù hợp cho hầu hết Nendoroid, figure 1/12 và RG Gundam. Đi kèm điều khiển từ xa nhỏ để bật tắt và chọn màu LED.

**Thông số kỹ thuật:**
* **Thương hiệu:** Kidslogic
* **Tỉ lệ:** N/A (Phụ kiện trưng bày)
* **Chất liệu:** ABS Base, Electromagnetic Module
* **Phụ kiện:** Magnetic Plate Adapter (×2), LED Remote, Power Adapter, Cleaning Cloth
* **Giá tham khảo:** ${vnd(1200000)}`,
      variants: [
        {
          option_name: 'Standard (Tải trọng ≤ 300g)',
          price: 850000,
          cost_price: 510000,
          stock_available: 15,
          stock_defect: 1,
          weight_g: 400,
          length_cm: 20, width_cm: 20, height_cm: 8,
          scale: 'N/A',
          material: 'ABS / Electromagnetic',
        },
        {
          option_name: 'Heavy Duty (Tải trọng ≤ 500g)',
          price: 1200000,
          cost_price: 720000,
          stock_available: 8,
          stock_defect: 0,
          weight_g: 600,
          length_cm: 25, width_cm: 25, height_cm: 10,
          scale: 'N/A',
          material: 'ABS / Electromagnetic (HD)',
        },
      ],
    },
  ];

  // ── 3. Tạo từng sản phẩm ──────────────────────────────────────────────────
  let productCount = 0;
  let variantCount = 0;

  for (const p of products) {
    const created = await prisma.products.create({
      data: {
        name: p.name,
        type_code: 'RETAIL',
        status_code: p.status_code,
        category_id: catMap.get(p.cat),
        brand_id: brandMap.get(p.brand),
        description: p.description,
        media_urls: [],
      },
    });

    for (let i = 0; i < p.variants.length; i++) {
      const v = p.variants[i];
      await prisma.product_variants.create({
        data: {
          product_id: created.product_id,
          sku: genSku(`SKU-${p.brand.substring(0, 3).toUpperCase()}`, variantCount),
          barcode: genSku('BAR', variantCount),
          option_name: v.option_name,
          price: v.price,
          cost_price: v.cost_price,
          stock_available: v.stock_available,   // kho hàng tốt
          stock_defect: v.stock_defect,          // kho hàng lỗi/hỏng
          weight_g: v.weight_g,
          length_cm: v.length_cm,
          width_cm: v.width_cm,
          height_cm: v.height_cm,
          scale: v.scale,
          material: v.material,
          media_assets: JSON.stringify([]),
        },
      });
      variantCount++;
    }

    productCount++;
    console.log(`  ✔ ${created.product_id.toString().padStart(3, ' ')} | ${p.name} (${p.variants.length} variants)`);
  }

  console.log(`\n🎉 HOÀN TẤT! Đã tạo ${productCount} sản phẩm RETAIL với ${variantCount} variants.`);
  console.log(`   → Mỗi variant đều có stock_available (hàng tốt) và stock_defect (hàng lỗi).`);
  console.log(`   → Description theo đúng format AI: marketing text + **Thông số kỹ thuật:** bullet.`);
}

main()
  .catch((e) => {
    console.error('❌ Lỗi seed:', e);
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
