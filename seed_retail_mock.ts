
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const items = [
  // --- GUNDAM MODELS (20) ---
  {
    name: "RG RX-93-v2 Hi-v Gundam",
    type: "RETAIL",
    cat: "Mô Hình",
    brand: "Bandai",
    price: 1250000,
    stock: 24,
    scale: "1/144",
    mat: "PVC, ABS",
    weight: 450,
    dims: { l: 31, w: 20, h: 10 },
    items: ["Beam Rifle", "Shield", "Fin Funnels", "Beam Saber"],
    desc: "Mẫu Real Grade (RG) với độ chi tiết cực cao, khớp nối linh hoạt và tỉ lệ cơ thể hoàn hảo."
  },
  {
    name: "MG Gundam Barbatos",
    type: "RETAIL",
    cat: "Mô Hình",
    brand: "Bandai",
    price: 980000,
    stock: 15,
    scale: "1/100",
    mat: "PVC, ABS, POM",
    weight: 800,
    dims: { l: 39, w: 31, h: 8 },
    items: ["Mace", "Long Sword", "300mm Smoothbore Gun"],
    desc: "Master Grade (MG) tái hiện khung xương Gundam Frame cực kỳ cơ khí và chi tiết từ series Iron-Blooded Orphans."
  },
  {
    name: "HG Rising Freedom Gundam",
    type: "RETAIL",
    cat: "Mô Hình",
    brand: "Bandai",
    price: 520000,
    stock: 50,
    scale: "1/144",
    mat: "PVC, ABS",
    weight: 300,
    dims: { l: 30, w: 19, h: 7 },
    items: ["Beam Rifle", "Shield", "Beam Saber"],
    desc: "Mẫu High Grade (HG) mới nhất từ phim Gundam Seed Freedom với khả năng biến hình phi cơ."
  },
  {
    name: "MGEX Strike Freedom Gundam",
    type: "RETAIL",
    cat: "Mô Hình",
    brand: "Bandai",
    price: 3500000,
    stock: 5,
    scale: "1/100",
    mat: "PVC, ABS, Metal Parts",
    weight: 1500,
    dims: { l: 55, w: 40, h: 15 },
    items: ["Multi-material Frame", "LED Unit", "Water Decals"],
    desc: "Đỉnh cao của dòng MG với khung xương mạ vàng nhiều lớp và độ chi tiết lộng lẫy."
  },
  {
    name: "PG Unleashed RX-78-2 Gundam",
    type: "RETAIL",
    cat: "Mô Hình",
    brand: "Bandai",
    price: 6500000,
    stock: 3,
    scale: "1/60",
    mat: "PVC, ABS, Die-cast",
    weight: 4000,
    dims: { l: 60, w: 45, h: 20 },
    items: ["LED Beam Saber", "Light-up Chest", "Core Fighter"],
    desc: "Perfect Grade (PG) thế hệ mới với trải nghiệm lắp ráp 5 giai đoạn tiến hóa của Robot."
  },
  {
    name: "HG Calibarn Gundam",
    type: "RETAIL",
    cat: "Mô Hình",
    brand: "Bandai",
    price: 480000,
    stock: 40,
    scale: "1/144",
    mat: "PVC, ABS",
    weight: 280,
    dims: { l: 30, w: 19, h: 6 },
    items: ["Broom Rifle", "Escutcheon Shield"],
    desc: "Cỗ máy mạnh nhất của nhân vật chính trong series The Witch from Mercury."
  },
  {
    name: "MG Sazabi Ver.Ka",
    type: "RETAIL",
    cat: "Mô Hình",
    brand: "Bandai",
    price: 2200000,
    stock: 8,
    scale: "1/100",
    mat: "PVC, ABS",
    weight: 2200,
    dims: { l: 59, w: 39, h: 12 },
    items: ["Long Beam Rifle", "Funnel effect parts", "Water Decals"],
    desc: "Một trong những mẫu MG đồ sộ và đẹp nhất thiết kế bởi Hajime Katoki."
  },
  {
    name: "RG Nu Gundam",
    type: "RETAIL",
    cat: "Mô Hình",
    brand: "Bandai",
    price: 1100000,
    stock: 20,
    scale: "1/144",
    mat: "PVC, ABS",
    weight: 400,
    dims: { l: 31, w: 19, h: 8 },
    items: ["Fin Funnels", "Beam Shot Rifle", "Hyper Bazooka"],
    desc: "Mẫu RG đỉnh cao với khả năng đứng vững dù mang dàn Funnel cồng kềnh."
  },
  {
    name: "HG Aerial Gundam",
    type: "RETAIL",
    cat: "Mô Hình",
    brand: "Bandai",
    price: 360000,
    stock: 100,
    scale: "1/144",
    mat: "PVC, ABS",
    weight: 250,
    dims: { l: 30, w: 19, h: 5 },
    items: ["Beam Rifle", "Shield Bit Stave"],
    desc: "Sản phẩm bán chạy nhất năm 2023 với thiết kế hiện đại và khớp nối thông minh."
  },
  {
    name: "MG Wing Gundam Zero EW Ver.Ka",
    type: "RETAIL",
    cat: "Mô Hình",
    brand: "Bandai",
    price: 1450000,
    stock: 12,
    scale: "1/100",
    mat: "PVC, ABS",
    weight: 850,
    dims: { l: 39, w: 31, h: 10 },
    items: ["Twin Buster Rifle", "Shield", "Feather parts"],
    desc: "Cánh thiên thần huyền thoại được tái hiện chân thực có thể gập mở linh hoạt."
  },
  {
    name: "RG Zeong",
    type: "RETAIL",
    cat: "Mô Hình",
    brand: "Bandai",
    price: 1400000,
    stock: 10,
    scale: "1/144",
    mat: "PVC, ABS",
    weight: 900,
    dims: { l: 39, w: 31, h: 9 },
    items: ["Lead wires", "Display Stand"],
    desc: "Mẫu Zeong hiện đại nhất với cơ chế chuyển động mắt và các chi tiết cơ khí bên trong."
  },
  {
    name: "MG Eclipse Gundam",
    type: "RETAIL",
    cat: "Mô Hình",
    brand: "Bandai",
    price: 1350000,
    stock: 18,
    scale: "1/100",
    mat: "PVC, ABS",
    weight: 950,
    dims: { l: 39, w: 31, h: 11 },
    items: ["Beam Rifle", "Beam Sword", "Transformable parts"],
    desc: "Thiết kế góc cạnh đặc trưng có khả năng biến hình sang dạng phi cơ tốc độ cao."
  },
  {
    name: "HG Moon Gundam",
    type: "RETAIL",
    cat: "Mô Hình",
    brand: "Bandai",
    price: 680000,
    stock: 25,
    scale: "1/144",
    mat: "PVC, ABS",
    weight: 450,
    dims: { l: 30, w: 19, h: 8 },
    items: ["Psycho Plate", "Long Rifle", "Butterfly Edge"],
    desc: "Mẫu HG không cần sticker với độ chi tiết vượt xa các sản phẩm cùng dòng."
  },
  {
    name: "RG Epyon Gundam",
    type: "RETAIL",
    cat: "Mô Hình",
    brand: "Bandai",
    price: 1050000,
    stock: 15,
    scale: "1/144",
    mat: "PVC, ABS",
    weight: 380,
    dims: { l: 31, w: 19, h: 9 },
    items: ["Epyon Sword", "Heat Rod", "Shield"],
    desc: "Kiệt tác phe phản diện từ series Gundam Wing với roi heat rod uốn lượn."
  },
  {
    name: "MG Freedom Gundam 2.0",
    type: "RETAIL",
    cat: "Mô Hình",
    brand: "Bandai",
    price: 1100000,
    stock: 30,
    scale: "1/100",
    mat: "PVC, ABS",
    weight: 750,
    dims: { l: 39, w: 31, h: 8 },
    items: ["Beam Rifle", "Lacus figure", "Shield"],
    desc: "Mẫu Gundam được yêu thích nhất mọi thời đại với biên độ khớp cực rộng."
  },
  {
    name: "HG Kshatriya",
    type: "RETAIL",
    cat: "Mô Hình",
    brand: "Bandai",
    price: 1150000,
    stock: 10,
    scale: "1/144",
    mat: "PVC, ABS",
    weight: 1200,
    dims: { l: 39, w: 31, h: 15 },
    items: ["Funnel x24", "Beam Saber x2"],
    desc: "Mẫu HG khổng lồ với 4 cánh (binder) đồ sộ có thể đóng mở linh hoạt."
  },
  {
    name: "RG God Gundam",
    type: "RETAIL",
    cat: "Mô Hình",
    brand: "Bandai",
    price: 1050000,
    stock: 20,
    scale: "1/144",
    mat: "PVC, ABS",
    weight: 350,
    dims: { l: 31, w: 19, h: 8 },
    items: ["Effect parts", "Hand parts set"],
    desc: "Khả năng tạo dáng võ thuật đỉnh cao nhờ khung xương mới mô phỏng cơ bắp người."
  },
  {
    name: "MG Tallgeese III",
    type: "RETAIL",
    cat: "Mô Hình",
    brand: "Bandai",
    price: 1650000,
    stock: 5,
    scale: "1/100",
    mat: "PVC, ABS",
    weight: 880,
    dims: { l: 39, w: 31, h: 9 },
    items: ["Mega Cannon", "Heat Rod", "Shield"],
    desc: "Hàng hiếm (P-Bandai) với thiết kế đầu chim ưng và vũ khí hạng nặng đặc trưng."
  },
  {
    name: "HG Penelope",
    type: "RETAIL",
    cat: "Mô Hình",
    brand: "Bandai",
    price: 1680000,
    stock: 7,
    scale: "1/144",
    mat: "PVC, ABS",
    weight: 1800,
    dims: { l: 45, w: 32, h: 18 },
    items: ["Odysseus Gundam", "Flight Unit"],
    desc: "Quái vật khổng lồ có thể tách ra thành robot cốt lõi và hệ thống bay Flight Unit."
  },
  {
    name: "RG Wing Gundam TV Ver",
    type: "RETAIL",
    cat: "Mô Hình",
    brand: "Bandai",
    price: 820000,
    stock: 15,
    scale: "1/144",
    mat: "PVC, ABS",
    weight: 320,
    dims: { l: 31, w: 19, h: 7 },
    items: ["Buster Rifle", "Shield", "Sabers"],
    desc: "Mẫu RG tái hiện trọn vẹn thiết kế gốc trên TV với phối màu rực rỡ."
  },

  // --- PRO TOOLS (10) ---
  {
    name: "GodHand PN-120 Blade Nipper",
    type: "RETAIL",
    cat: "Dụng Cụ",
    brand: "GodHand",
    price: 1150000,
    stock: 10,
    scale: "Professional",
    mat: "Special Steel",
    weight: 120,
    dims: { l: 15, w: 8, h: 2 },
    items: ["Protection Cap"],
    desc: "Kìm cắt chuyên dụng với lưỡi siêu mỏng, giúp vết cắt phẳng mịn gần như không cần chà nhám."
  },
  {
    name: "Tamiya Extra Thin Cement (40ml)",
    type: "RETAIL",
    cat: "Dụng Cụ",
    brand: "Tamiya",
    price: 105000,
    stock: 100,
    scale: "Essential",
    mat: "Chemical Liquid",
    weight: 80,
    dims: { l: 5, w: 5, h: 7 },
    items: ["Brush Cap"],
    desc: "Keo dán nhựa lỏng siêu loãng, tự len lỏi vào khe hở nhờ lực mao dẫn."
  },
  {
    name: "Mr.Hobby Airbrush Procon Boy PS-289",
    type: "RETAIL",
    cat: "Dụng Cụ",
    brand: "Mr.Hobby",
    price: 2850000,
    stock: 4,
    scale: "0.3mm",
    mat: "Metal",
    weight: 350,
    dims: { l: 20, w: 10, h: 4 },
    items: ["Wrench", "Nozzle key"],
    desc: "Bút vẽ mô hình chuyên dụng 0.3mm, tiêu chuẩn vàng cho mọi Gundamer."
  },
  {
    name: "DSPIAE ST-A Single Blade Nipper",
    type: "RETAIL",
    cat: "Dụng Cụ",
    brand: "DSPIAE",
    price: 780000,
    stock: 25,
    scale: "Precision",
    mat: "Carbon Steel",
    weight: 140,
    dims: { l: 16, w: 9, h: 2 },
    items: ["Cleaning cloth", "Spring spare"],
    desc: "Đối thủ nặng ký của GodHand với giá thành hợp lý và độ bền cực cao."
  },
  {
    name: "Tamiya Sharp Pointed Nipper (Blue)",
    type: "RETAIL",
    cat: "Dụng Cụ",
    brand: "Tamiya",
    price: 640000,
    stock: 30,
    scale: "High Quality",
    mat: "Hardened Steel",
    weight: 110,
    dims: { l: 14, w: 7, h: 2 },
    items: ["Grip case"],
    desc: "Kìm cắt bền bỉ bậc nhất từ Tamiya, phù hợp cho cả người mới và chuyên nghiệp."
  },
  {
    name: "The Gundam Marker Set - Basic",
    type: "RETAIL",
    cat: "Dụng Cụ",
    brand: "Mr.Hobby",
    price: 320000,
    stock: 50,
    scale: "Painting",
    mat: "Ink",
    weight: 150,
    dims: { l: 15, w: 10, h: 2 },
    items: ["6 Colors markers"],
    desc: "Bộ bút tô màu chuyên dụng cho Gundam, dễ sử dụng, khô nhanh và bám tốt."
  },
  {
    name: "Mr.Color Thinner 400ml",
    type: "RETAIL",
    cat: "Dụng Cụ",
    brand: "Mr.Hobby",
    price: 240000,
    stock: 40,
    scale: "Chemical",
    mat: "Solvent",
    weight: 450,
    dims: { l: 18, w: 8, h: 8 },
    items: ["Sealed cap"],
    desc: "Dung môi pha sơn gốc Lacquer tiêu chuẩn, giúp lớp sơn mịn màng và đều màu."
  },
  {
    name: "Tamiya Modeler's Knife",
    type: "RETAIL",
    cat: "Dụng Cụ",
    brand: "Tamiya",
    price: 210000,
    stock: 60,
    scale: "Trimming",
    mat: "Plastic & Carbon Steel",
    weight: 50,
    dims: { l: 16, w: 2, h: 2 },
    items: ["25 Spare blades"],
    desc: "Dao trổ mô hình độ chính xác cao, tay cầm chắc chắn chống trượt."
  },
  {
    name: "Glass File - Shine Polisher",
    type: "RETAIL",
    cat: "Dụng Cụ",
    brand: "DSPIAE",
    price: 180000,
    stock: 80,
    scale: "Finishing",
    mat: "Tempered Glass",
    weight: 40,
    dims: { l: 10, w: 1, h: 0.5 },
    items: ["Small case"],
    desc: "Giũa thủy tinh giúp xử lý ghẻ nhanh chóng và đánh bóng nhựa như gương."
  },
  {
    name: "Tamiya Panel Line Accent (Black)",
    type: "RETAIL",
    cat: "Dụng Cụ",
    brand: "Tamiya",
    price: 145000,
    stock: 90,
    scale: "Panel Lining",
    mat: "Enamel",
    weight: 60,
    dims: { l: 4, w: 4, h: 6 },
    items: ["Brush in cap"],
    desc: "Sơn kẻ lằn chìm giúp làm nổi bật các chi tiết máy móc trên mô hình."
  },

  // --- ACCESSORIES & DECAL (10) ---
  {
    name: "Action Base 4 Black",
    type: "RETAIL",
    cat: "Phụ Kiện",
    brand: "Bandai",
    price: 160000,
    stock: 40,
    scale: "1/144 & 1/100",
    mat: "ABS",
    weight: 300,
    dims: { l: 25, w: 20, h: 4 },
    items: ["Connectors", "Base parts"],
    desc: "Đế trưng bày hỗ trợ nhiều tư thế bay lượn cho mô hình nhựa HG và MG."
  },
  {
    name: "Action Base 1 Clear",
    type: "RETAIL",
    cat: "Phụ Kiện",
    brand: "Bandai",
    price: 180000,
    stock: 30,
    scale: "1/100",
    mat: "ABS",
    weight: 350,
    dims: { l: 30, w: 22, h: 5 },
    items: ["Large adapter", "Screw set"],
    desc: "Đế trưng bày bản lớn dành riêng cho các mẫu Master Grade tải trọng lớn."
  },
  {
    name: "LED Unit Blue (Single)",
    type: "RETAIL",
    cat: "Phụ Kiện",
    brand: "Bandai",
    price: 110000,
    stock: 25,
    scale: "Electronics",
    mat: "Plastic & LED",
    weight: 20,
    dims: { l: 2, w: 2, h: 1.5 },
    items: ["Battery case (No battery)"],
    desc: "Đèn LED chính hãng giúp mắt Gundam và ngực tỏa sáng rực rỡ."
  },
  {
    name: "Water Slide Decal - RX-93-v2 Hi-v",
    type: "RETAIL",
    cat: "Phụ Kiện",
    brand: "Bandai",
    price: 120000,
    stock: 60,
    scale: "1/144 RG",
    mat: "Decal Paper",
    weight: 10,
    dims: { l: 15, w: 10, h: 0.1 },
    items: ["Decal sheet"],
    desc: "Decal nước độ nét cao chính hãng, giúp mô hình trông chuyên nghiệp hơn."
  },
  {
    name: "Detail Up Part - Metal Thruster A",
    type: "RETAIL",
    cat: "Phụ Kiện",
    brand: "G-Temple",
    price: 250000,
    stock: 12,
    scale: "1/100 MG",
    mat: "Aluminum",
    weight: 40,
    dims: { l: 5, w: 5, h: 2 },
    items: ["4 Metal parts"],
    desc: "Ống xả kim loại thay thế giúp tăng vẻ cơ khí và hầm hố cho mô hình."
  },
  {
    name: "Mini Figurine Set - Zeon Crew",
    type: "RETAIL",
    cat: "Phụ Kiện",
    brand: "Bandai",
    price: 150000,
    stock: 20,
    scale: "1/144",
    mat: "PVC",
    weight: 30,
    dims: { l: 10, w: 6, h: 1 },
    items: ["10 Unpainted figures"],
    desc: "Bộ binh lính và phi công tỉ lệ 1/144 để trang trí sa bàn cạnh Gundam."
  },
  {
    name: "Builders Parts - HD Wing 01",
    type: "RETAIL",
    cat: "Phụ Kiện",
    brand: "Bandai",
    price: 160000,
    stock: 15,
    scale: "Customization",
    mat: "ABS",
    weight: 120,
    dims: { l: 18, w: 12, h: 2 },
    items: ["Wing parts set"],
    desc: "Cánh phản lực gắn thêm để tùy biến robot của bạn theo phong cách độc đáo."
  },
  {
    name: "HGBC Giant Gatling",
    type: "RETAIL",
    cat: "Phụ Kiện",
    brand: "Bandai",
    price: 150000,
    stock: 45,
    scale: "1/144",
    mat: "ABS",
    weight: 150,
    dims: { l: 20, w: 10, h: 2 },
    items: ["Gatling gun", "Ammo belt"],
    desc: "Vũ khí gatling khổng lồ có thể gắn cho bất kỳ dòng HG nào có tay cầm chuẩn."
  },
  {
    name: "MS Effect 01 (Yellow)",
    type: "RETAIL",
    cat: "Phụ Kiện",
    brand: "Bandai",
    price: 190000,
    stock: 20,
    scale: "Interaction",
    mat: "Soft PVC",
    weight: 200,
    dims: { l: 15, w: 10, h: 5 },
    items: ["Blast effect x3"],
    desc: "Hiệu ứng nổ và động cơ giúp các bức ảnh chụp mô hình sinh động hơn."
  },
  {
    name: "Mechanical Chain Base 01",
    type: "RETAIL",
    cat: "Phụ Kiện",
    brand: "Kotobukiya",
    price: 450000,
    stock: 10,
    scale: "1/144 & 1/100",
    mat: "ABS",
    weight: 600,
    dims: { l: 15, w: 15, h: 18 },
    items: ["Floor unit", "Wall unit"],
    desc: "Bối cảnh xưởng sửa chữa Robot có thể ghép nối nhiều bộ lại với nhau."
  }
];

async function seed() {
  console.log('🚀 CHIẾN DỊCH NẠP 40 MOCK DATA RETAIL BẮT ĐẦU...');

  // 1. CHUẨN BỊ MÔI TRƯỜNG (CATEGORY & BRAND)
  const categoryMap = new Map();
  const brandMap = new Map();

  // Tạo Category chuẩn
  const categoryNames = ["Mô Hình", "Dụng Cụ", "Phụ Kiện"];
  for (const name of categoryNames) {
    const cat = await prisma.categories.upsert({
      where: { name },
      update: {},
      create: { name, slug: name.toLowerCase().replace(/ /g, '-') }
    });
    categoryMap.set(name, cat.category_id);
  }

  // Tạo Brand chuẩn
  const brandNames = ["Bandai", "GodHand", "Tamiya", "Mr.Hobby", "DSPIAE", "G-Temple", "Kotobukiya"];
  for (const name of brandNames) {
    const brand = await prisma.brands.upsert({
      where: { name },
      update: {},
      create: { name }
    });
    brandMap.set(name, brand.brand_id);
  }

  // 2. NẠP PRODUCT & VARIANT
  let count = 0;
  for (const item of items) {
    // Tạo format description Markdown
    const formattedDesc = `${item.desc}\n\n**Thông số kỹ thuật:**\n* **Thương hiệu:** ${item.brand}\n* **Tỉ lệ:** ${item.scale}\n* **Chất liệu:** ${item.mat}\n* **Cấu thành cơ bản:** ${item.items.join(', ')}`;

    const generateVariantData = (optName: string, priceModifier: number, stockModifier: number, extraItems: string[] = []) => {
      const sku = `FIGI-${count.toString().padStart(3, '0')}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
      const barcode = `BAR-${Math.floor(Math.random() * 9000) + 1000}-${Math.floor(Math.random() * 1000)}`;
      const vPrice = item.price + priceModifier;
      return {
        sku: sku,
        barcode: barcode,
        option_name: optName,
        price: vPrice,
        cost_price: Math.round(vPrice * 0.7),
        stock_available: Math.max(1, item.stock + stockModifier),
        weight_g: item.weight,
        length_cm: item.dims.l,
        width_cm: item.dims.w,
        height_cm: item.dims.h,
        scale: item.scale,
        material: item.mat,
        included_items: [...item.items, ...extraItems],
        description: `${formattedDesc}\n* **Giá tham khảo:** ${vPrice.toLocaleString('vi-VN')} VND`
      };
    };

    let variantsToCreate = [];

    // Tạo đa dạng biến thể cho từng dòng sản phẩm
    if (item.cat === "Dụng Cụ") {
      variantsToCreate.push(generateVariantData("Bộ tiêu chuẩn", 0, 0));
      if (item.name.includes("Knife")) {
        variantsToCreate.push(generateVariantData("Combo VIP (Tặng thêm 50 lưỡi dao)", 80000, -10, ["50 Lưỡi dao dự phòng"]));
      } else if (item.name.includes("Nipper")) {
        variantsToCreate.push(generateVariantData("Bản Đặc Biệt (Kèm bao da bảo vệ)", 150000, -5, ["Bao da bảo vệ cao cấp"]));
      }
    } else if (item.name.includes("Gundam")) {
      variantsToCreate.push(generateVariantData("Standard Edition", 0, 0));
      if (item.price > 1500000) {
        variantsToCreate.push(generateVariantData("Premium Color Edition", 500000, -2, ["Màu sơn giới hạn", "Decal kim loại"]));
        variantsToCreate.push(generateVariantData("Full Mechanics (Kèm Base + LED)", 800000, -4, ["Đế trưng bày", "Đèn LED RGB"]));
      } else {
        variantsToCreate.push(generateVariantData("Clear Color Limited", 300000, -5, ["Áo giáp trong suốt (Clear Armor)"]));
      }
    } else {
      variantsToCreate.push(generateVariantData("Standard Set", 0, 0));
      if (item.cat === "Phụ Kiện") {
        variantsToCreate.push(generateVariantData("Combo x2 (Tiết kiệm 10%)", Math.round((item.price * 2) * 0.9) - item.price, -2, ["Gấp đôi phụ kiện"]));
      }
    }

    try {
      await prisma.products.create({
        data: {
          name: item.name,
          type_code: item.type,
          status_code: "ACTIVE",
          category_id: categoryMap.get(item.cat),
          brand_id: brandMap.get(item.brand),
          description: formattedDesc,
          product_variants: {
            create: variantsToCreate as any
          }
        }
      });
      count++;
      console.log(`✅ [${count}/40] Nạp thành công: ${item.name} (${variantsToCreate.length} variants)`);
    } catch (e: any) {
      console.error(`❌ Lỗi khi nạp ${item.name}:`, e.message);
    }
  }

  console.log('🎉 HOÀN TẤT NẠP 40 MOCK ITEMS. HỆ THỐNG ĐÃ SẴN SÀNG ĐỂ TEST BÁN HÀNG.');
}

seed()
  .catch((e) => {
    console.error('❌ Seeding Error:', e);
    // process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
