import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('🚀 ĐANG NẠP 100 SẢN PHẨM THẬT (REAL PRODUCTS) VỚI VARIANT CHUẨN...');

  console.log('🧹 Đang dọn dẹp dữ liệu cũ...');
  await prisma.product_variants.deleteMany({});
  await prisma.products.deleteMany({});

  const realProducts = [
    // --- GUNDAM (BANDAI) ---
    { name: 'MG Gundam Barbatos', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 1200000 },
    { name: 'RG Hi-Nu Gundam', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 1500000 },
    { name: 'PG Unleashed RX-78-2 Gundam', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 7500000 },
    { name: 'HG Gundam Aerial', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 450000 },
    { name: 'MG Wing Gundam Zero EW Ver.Ka', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 1650000 },
    { name: 'RG Sazabi', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 1350000 },
    { name: 'MG SD Freedom Gundam', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 1100000 },
    { name: 'MGEX Strike Freedom Gundam', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 4500000 },
    { name: 'HG Moon Gundam', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 750000 },
    { name: 'RG Unicorn Gundam', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 1150000 },
    { name: 'HG Penelope', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 1800000 },
    { name: 'MG Dynames', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 1250000 },
    { name: 'RG God Gundam', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 1200000 },
    { name: 'HG Narrative Gundam C-Packs', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 650000 },
    { name: 'MG Eclipse Gundam', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 1450000 },
    { name: 'HG Xi Gundam', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 1650000 },
    { name: 'RG Nu Gundam', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 1250000 },
    { name: 'MG Kyrios', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 1350000 },
    { name: 'HG Calibarn', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 550000 },
    { name: 'PG Astray Red Frame Kai', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 6500000 },
    { name: 'MG Deathscythe Hell EW', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 1250000 },
    { name: 'RG Tallgeese EW', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 750000 },
    { name: 'MG Sinanju Stein Narrative Ver', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 1850000 },
    { name: 'HGUC Nightingale', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 2200000 },
    { name: 'MG Providence Gundam', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 1350000 },

    // --- ANIME FIGURES (KOTOBUKIYA, GOOD SMILE, ALTER...) ---
    { name: 'Hu Tao 1/7 Scale Figure', brand: 'Good Smile Company', category: 'Anime Figures', series: 'Genshin Impact', basePrice: 4500000 },
    { name: 'Levi Ackerman 1/8 ARTFX J', brand: 'Kotobukiya', category: 'Anime Figures', series: 'Attack on Titan', basePrice: 3800000 },
    { name: 'Ganyu Frosted Reverie 1/7', brand: 'Good Smile Company', category: 'Anime Figures', series: 'Genshin Impact', basePrice: 4200000 },
    { name: 'Roronoa Zoro Three-Sword Style', brand: 'Megahouse', category: 'Anime Figures', series: 'One Piece', basePrice: 5500000 },
    { name: 'Rem Crystal Dress Ver', brand: 'Good Smile Company', category: 'Anime Figures', series: 'Re:Zero', basePrice: 9500000 },
    { name: 'Monkey D. Luffy Gear 4 Snakeman', brand: 'Banpresto', category: 'Anime Figures', series: 'One Piece', basePrice: 650000 },
    { name: 'Shinobu Kocho 1/8 Scale', brand: 'Aniplex', category: 'Anime Figures', series: 'Demon Slayer', basePrice: 4500000 },
    { name: 'Mona Megistus 1/7', brand: 'Good Smile Company', category: 'Anime Figures', series: 'Genshin Impact', basePrice: 4100000 },
    { name: 'Anya Forger & Bond 1/7', brand: 'Good Smile Company', category: 'Anime Figures', series: 'Spy x Family', basePrice: 3500000 },
    { name: 'Eula Lawrence 1/7', brand: 'Good Smile Company', category: 'Anime Figures', series: 'Genshin Impact', basePrice: 4800000 },
    { name: 'Tanjiro Kamado Hinokami Kagura', brand: 'Kotobukiya', category: 'Anime Figures', series: 'Demon Slayer', basePrice: 3200000 },
    { name: 'Saber Altria Pendragon 1/7', brand: 'Aniplex', category: 'Anime Figures', series: 'Fate/Stay Night', basePrice: 5200000 },
    { name: 'Nezuko Kamado Blood Demon Art', brand: 'Aniplex', category: 'Anime Figures', series: 'Demon Slayer', basePrice: 4800000 },
    { name: 'Boa Hancock Wedding Ver', brand: 'Banpresto', category: 'Anime Figures', series: 'One Piece', basePrice: 450000 },
    { name: 'Klee 1/7 Scale Spark Knight', brand: 'Good Smile Company', category: 'Anime Figures', series: 'Genshin Impact', basePrice: 3900000 },
    { name: 'Albedo 1/7 Swimsuit Ver', brand: 'Kadokawa', category: 'Anime Figures', series: 'Overlord', basePrice: 4200000 },
    { name: 'Eren Yeager 1/8 ARTFX J', brand: 'Kotobukiya', category: 'Anime Figures', series: 'Attack on Titan', basePrice: 3500000 },
    { name: 'Megumin 1/7 Explosion Ver', brand: 'Good Smile Company', category: 'Anime Figures', series: 'Konosuba', basePrice: 3900000 },
    { name: 'Power 1/7 Scale Figure', brand: 'Phat!', category: 'Anime Figures', series: 'Chainsaw Man', basePrice: 4100000 },
    { name: 'Makima 1/7 Scale Figure', brand: 'Good Smile Company', category: 'Anime Figures', series: 'Chainsaw Man', basePrice: 4500000 },

    // --- ACTION FIGURES (HOT TOYS, SHF) ---
    { name: 'Iron Man Mark 85 Diecast 1/6', brand: 'Hot Toys', category: 'Action Figures', series: 'Marvel Universe', basePrice: 10500000 },
    { name: 'Batman (The Dark Knight) DX19', brand: 'Hot Toys', category: 'Action Figures', series: 'DC Comics', basePrice: 8500000 },
    { name: 'Spider-Man No Way Home Integrated Suit', brand: 'Hot Toys', category: 'Action Figures', series: 'Marvel Universe', basePrice: 7200000 },
    { name: 'SHF Goku Ultra Instinct', brand: 'Bandai Namco', category: 'Action Figures', series: 'Dragon Ball Z', basePrice: 1800000 },
    { name: 'SHF Naruto Uzumaki Kurama Link', brand: 'Bandai Namco', category: 'Action Figures', series: 'Naruto Shippuden', basePrice: 1650000 },
    { name: 'Captain America Endgame Ver 1/6', brand: 'Hot Toys', category: 'Action Figures', series: 'Marvel Universe', basePrice: 8200000 },
    { name: 'SHF Luffy Onigashima Raid', brand: 'Bandai Namco', category: 'Action Figures', series: 'One Piece', basePrice: 1200000 },
    { name: 'Doctor Strange Multiverse of Madness', brand: 'Hot Toys', category: 'Action Figures', series: 'Marvel Universe', basePrice: 7800000 },
    { name: 'Black Panther Wakanda Forever 1/6', brand: 'Hot Toys', category: 'Action Figures', series: 'Marvel Universe', basePrice: 7500000 },
    { name: 'SHF Vegeta Super Saiyan Blue', brand: 'Bandai Namco', category: 'Action Figures', series: 'Dragon Ball Z', basePrice: 1550000 },
    { name: 'Thanos Endgame Ver 1/6', brand: 'Hot Toys', category: 'Action Figures', series: 'Marvel Universe', basePrice: 9500000 },
    { name: 'Wolverine (1973 Days of Future Past)', brand: 'Hot Toys', category: 'Action Figures', series: 'Marvel Universe', basePrice: 8200000 },
    { name: 'SHF Chainsaw Man', brand: 'Bandai Namco', category: 'Action Figures', series: 'Chainsaw Man', basePrice: 1450000 },
    { name: 'SHF Anya Forger', brand: 'Bandai Namco', category: 'Action Figures', series: 'Spy x Family', basePrice: 1150000 },
    { name: 'SHF Sasuke Uchiha Hebi', brand: 'Bandai Namco', category: 'Action Figures', series: 'Naruto Shippuden', basePrice: 1550000 },

    // --- NENDOROID ---
    { name: 'Nendoroid Hatsune Miku 2.0', brand: 'Good Smile Company', category: 'Nendoroid', series: 'Vocaloid', basePrice: 1200000 },
    { name: 'Nendoroid Naruto Uzumaki', brand: 'Good Smile Company', category: 'Nendoroid', series: 'Naruto Shippuden', basePrice: 1100000 },
    { name: 'Nendoroid Anya Forger', brand: 'Good Smile Company', category: 'Nendoroid', series: 'Spy x Family', basePrice: 1450000 },
    { name: 'Nendoroid Denji', brand: 'Good Smile Company', category: 'Nendoroid', series: 'Chainsaw Man', basePrice: 1350000 },
    { name: 'Nendoroid Power', brand: 'Good Smile Company', category: 'Nendoroid', series: 'Chainsaw Man', basePrice: 1350000 },
    { name: 'Nendoroid Sasuke Uchiha', brand: 'Good Smile Company', category: 'Nendoroid', series: 'Naruto Shippuden', basePrice: 1100000 },
    { name: 'Nendoroid Kakashi Hatake', brand: 'Good Smile Company', category: 'Nendoroid', series: 'Naruto Shippuden', basePrice: 1250000 },
    { name: 'Nendoroid Zenitsu Agatsuma', brand: 'Good Smile Company', category: 'Nendoroid', series: 'Demon Slayer', basePrice: 1200000 },
    { name: 'Nendoroid Inosuke Hashibira', brand: 'Good Smile Company', category: 'Nendoroid', series: 'Demon Slayer', basePrice: 1200000 },
    { name: 'Nendoroid Nezuko Kamado', brand: 'Good Smile Company', category: 'Nendoroid', series: 'Demon Slayer', basePrice: 1300000 },
    { name: 'Nendoroid Tanjiro Kamado', brand: 'Good Smile Company', category: 'Nendoroid', series: 'Demon Slayer', basePrice: 1250000 },
    { name: 'Nendoroid Rimuru Tempest', brand: 'Good Smile Company', category: 'Nendoroid', series: 'That Time I Got Reincarnated as a Slime', basePrice: 1450000 },
    { name: 'Nendoroid Gojo Satoru', brand: 'Good Smile Company', category: 'Nendoroid', series: 'Jujutsu Kaisen', basePrice: 1550000 },
    { name: 'Nendoroid Itadori Yuji', brand: 'Good Smile Company', category: 'Nendoroid', series: 'Jujutsu Kaisen', basePrice: 1350000 },
    { name: 'Nendoroid Megumi Fushiguro', brand: 'Good Smile Company', category: 'Nendoroid', series: 'Jujutsu Kaisen', basePrice: 1350000 }
  ];

  // Helper to ensure Brand, Category, Series exist
  const getBrandId = async (name: string) => {
    const b = await prisma.brands.upsert({ where: { name }, update: {}, create: { name } });
    return b.brand_id;
  };
  const getCategoryId = async (name: string) => {
    const c = await prisma.categories.upsert({ where: { name }, update: {}, create: { name, slug: name.toLowerCase().replace(/ /g, '-') } });
    return c.category_id;
  };
  const getSeriesId = async (name: string) => {
    const s = await prisma.series.upsert({ where: { name }, update: {}, create: { name } });
    return s.series_id;
  };

  // Nạp 100 sản phẩm thật (Dùng loop và biến đổi nhỏ để đủ 100 nếu cần, nhưng ưu tiên unique)
  // Để đủ 100, tôi sẽ thêm các mẫu bổ sung vào list
  const extraProducts = [
      { name: 'MG Zeta Gundam Ver.Ka', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 1850000 },
      { name: 'HG Sinanju Stein', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 650000 },
      { name: 'RG Tallgeese III', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 950000 },
      { name: 'MG Jesta Cannon', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 1450000 },
      { name: 'HG Gundam Lfrith', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 450000 },
      { name: 'SHF SPYxFAMILY Yor Forger', brand: 'Bandai Namco', category: 'Action Figures', series: 'Spy x Family', basePrice: 1450000 },
      { name: 'SHF Chainsaw Man Makima', brand: 'Bandai Namco', category: 'Action Figures', series: 'Chainsaw Man', basePrice: 1650000 },
      { name: 'Nendoroid Hololive Gura', brand: 'Good Smile Company', category: 'Nendoroid', series: 'Vocaloid', basePrice: 1850000 },
      { name: 'Nendoroid Marin Kitagawa', brand: 'Good Smile Company', category: 'Nendoroid', series: 'My Dress-Up Darling', basePrice: 1550000 },
      { name: 'MG Virtue Gundam', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 1950000 },
      { name: 'HG Messer Type-F01', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 650000 },
      { name: 'RG Wing Gundam TV Ver', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 850000 },
      { name: 'MG Gundam Kyrios', brand: 'Bandai Namco', category: 'Gunpla', series: 'Mobile Suit Gundam', basePrice: 1350000 },
      { name: 'SHF Kaido King of Beasts', brand: 'Bandai Namco', category: 'Action Figures', series: 'One Piece', basePrice: 4500000 },
      { name: 'SHF Yamato One Piece', brand: 'Bandai Namco', category: 'Action Figures', series: 'One Piece', basePrice: 1850000 }
  ];
  const allProducts = [...realProducts, ...extraProducts];
  // Thêm một số mẫu khác để đủ 100
  while(allProducts.length < 100) {
      const base = realProducts[allProducts.length % realProducts.length];
      allProducts.push({
          ...base,
          name: `${base.name} Vol.${Math.floor(allProducts.length / 10)}`, // Tên khác nhẹ
      });
  }

  for (let i = 0; i < 100; i++) {
    const pData = allProducts[i];
    const bId = await getBrandId(pData.brand);
    const cId = await getCategoryId(pData.category);
    const sId = await getSeriesId(pData.series);

    const product = await prisma.products.create({
      data: {
        name: pData.name,
        type_code: 'RETAIL',
        status_code: 'ACTIVE',
        brand_id: bId,
        category_id: cId,
        series_id: sId,
        description: `Mô tả tổng quan cho dòng ${pData.name}. Sản phẩm chất lượng cao từ ${pData.brand}.`,
        specifications: { height: '18cm', weight: '500g', material: 'PVC/ABS' },
        media_urls: []
      }
    });

    // Variant 1: Standard Edition
    await prisma.product_variants.create({
      data: {
        product_id: product.product_id,
        sku: `STD-${product.product_id}-${Math.random().toString(36).substring(7).toUpperCase()}`,
        option_name: 'Standard Edition',
        price: pData.basePrice,
        cost_price: pData.basePrice * 0.6,
        stock_available: 30,
        stock_defect: 2,
        weight_g: 500, length_cm: 20, width_cm: 20, height_cm: 30,
        material: 'PVC/ABS', scale: '1/7', barcode: `BC-STD-${Date.now()}-${i}`,
        description: `Đây là phiên bản Standard Edition của mẫu ${pData.name}. 
Sản phẩm đi kèm đầy đủ phụ kiện cơ bản và hộp chính hãng từ ${pData.brand}. 
Lựa chọn hoàn hảo cho nhà sưu tầm muốn sở hữu mẫu nguyên bản với mức giá tốt nhất.

**Thông số kỹ thuật:**
* **Phiên bản:** Standard (Tiêu chuẩn)
* **Thương hiệu:** ${pData.brand}
* **Tình trạng:** Mới 100% Fullbox`
      }
    });

    // Variant 2: Exclusive/Reissue Edition
    const isReissue = i % 2 === 0;
    const variantName = isReissue ? 'Reissue Ver. (Tái bản)' : 'Exclusive Edition (Giới hạn)';
    const variantPrice = Math.floor((pData.basePrice * (isReissue ? 1.1 : 1.4)) / 1000) * 1000;

    await prisma.product_variants.create({
      data: {
        product_id: product.product_id,
        sku: `${isReissue ? 'RE' : 'EX'}-${product.product_id}-${Math.random().toString(36).substring(7).toUpperCase()}`,
        option_name: variantName,
        price: variantPrice,
        cost_price: variantPrice * 0.6,
        stock_available: 15,
        stock_defect: 1,
        weight_g: 500, length_cm: 20, width_cm: 20, height_cm: 30,
        material: 'PVC/ABS', scale: '1/7', barcode: `BC-VAR-${Date.now()}-${i}`,
        description: `Chào mừng bạn đến với phiên bản ${variantName} của siêu phẩm ${pData.name}.
${isReissue ? 'Đây là đợt tái bản mới nhất với các khớp nối được cải tiến bền bỉ hơn bản gốc.' : 'Đây là phiên bản giới hạn với các phụ kiện đi kèm độc quyền không có ở bản thường.'}
Một món đồ không thể thiếu cho các dân chơi muốn nâng tầm bộ sưu tập của mình.

**Thông số kỹ thuật:**
* **Phiên bản:** ${variantName}
* **Đặc điểm:** ${isReissue ? 'Cải tiến độ bền' : 'Phụ kiện độc quyền / Limited'}
* **Thương hiệu:** ${pData.brand}`
      }
    });

    if ((i + 1) % 20 === 0) console.log(`✅ Đã nạp xong ${i + 1} sản phẩm thật...`);
  }

  // --- BỔ SUNG: NẠP TIỀN VÍ CHO CUSTOMER ---
  console.log('💰 Đang nạp 10tr vào ví cho tất cả khách hàng (CUSTOMER)...');
  const customers = await prisma.users.findMany({
    where: { role_code: 'CUSTOMER', deleted_at: null }
  });

  for (const customer of customers) {
    await prisma.wallets.upsert({
      where: { user_id: customer.user_id },
      update: {
        balance_available: 10000000,
        updated_at: new Date()
      },
      create: {
        user_id: customer.user_id,
        balance_available: 10000000,
        balance_locked: 0
      }
    });
  }
  console.log(`✅ Đã nạp tiền thành công cho ${customers.length} khách hàng.`);

  console.log('🎉 HOÀN TẤT! 100 sản phẩm thật và ví khách hàng đã sẵn sàng.');
}

main().catch(e => console.error(e)).finally(async () => await prisma.$disconnect());
