import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🚀 BẮT ĐẦU DỌN DẸP VÀ NẠP DỮ LIỆU SEED MỚI...');

    // 0. Xóa dữ liệu cũ (Xóa từ bảng con đến bảng cha để tránh lỗi khóa ngoại)
    await prisma.cart_items.deleteMany();
    await prisma.order_items.deleteMany();
    await prisma.return_items.deleteMany();
    await prisma.return_requests.deleteMany();
    await prisma.payment_transactions.deleteMany();
    await prisma.inventory_logs.deleteMany();
    await prisma.inventory_receipt_items.deleteMany();
    await prisma.preorder_contracts.deleteMany();
    await prisma.product_blindboxes.deleteMany();
    await prisma.product_preorder_configs.deleteMany();
    await prisma.product_variants.deleteMany();
    await prisma.products.deleteMany();
    console.log('🗑️ Đã xóa sạch dữ liệu sản phẩm cũ!');

    // 1. DỊCH VỤ CHUẨN BỊ (BRANDS & CATEGORIES)
    const categoryNames = ["Model Kits", "Action Figures", "Professional Tools", "Modeling Supplies", "Display Accessories"];
    const brandNames = ["Bandai", "Moshow Toys", "Motor Nuclear", "ThreeZero", "Hot Toys", "Good Smile Company", "Tamiya", "Mr. Hobby"];
    
    const catMap = new Map();
    const brandMap = new Map();

    for (const name of categoryNames) {
        const cat = await prisma.categories.upsert({
            where: { name },
            update: {},
            create: { name, slug: name.toLowerCase().replace(/ /g, '-') }
        });
        catMap.set(name, cat.category_id);
    }

    for (const name of brandNames) {
        const brand = await prisma.brands.upsert({
            where: { name },
            update: {},
            create: { name }
        });
        brandMap.set(name, brand.brand_id);
    }

    console.log(`✅ [SETUP] Đã chuẩn bị ${catMap.size} danh mục và ${brandMap.size} thương hiệu.`);

    // 2. DANH SÁCH SẢN PHẨM RETAIL (CÓ NHIỀU BIẾN THỂ)
    const retailItems = [
        {
            name: "PG Unleashed RX-78-2 Gundam",
            brand: "Bandai",
            cat: "Model Kits",
            basePrice: 6500000,
            desc: "Đỉnh cao của công nghệ chế tác mô hình từ Bandai. PG Unleashed RX-78-2 mang đến trải nghiệm tuyệt vời.",
            variants: [
                { option: "Standard Edition", priceMod: 1, stock: 15 },
                { option: "Clear Color Premium", priceMod: 1.2, stock: 5 },
                { option: "Titanium Finish", priceMod: 1.5, stock: 2 }
            ]
        },
        {
            name: "MGEX Strike Freedom Gundam",
            brand: "Bandai",
            cat: "Model Kits",
            basePrice: 3650000,
            desc: "Dòng Master Grade Extreme tập trung vào biểu cảm cao nhất của kim loại.",
            variants: [
                { option: "Normal Extra Finish", priceMod: 1, stock: 20 },
                { option: "Midnight Coating", priceMod: 1.4, stock: 3 },
            ]
        },
        {
            name: "Moshow Toys Takeda Shingen",
            brand: "Moshow Toys",
            cat: "Action Figures",
            basePrice: 3250000,
            desc: "Đỉnh cao của dòng Metal Build từ Moshow. Takeda Shingen với khối lượng kim loại cực lớn.",
            variants: [
                { option: "Regular Armor", priceMod: 1, stock: 10 },
                { option: "Battle Damaged", priceMod: 1.1, stock: 4 }
            ]
        },
        {
            name: "ThreeZero DLX Iron Man Mark 50",
            brand: "ThreeZero",
            cat: "Action Figures",
            basePrice: 2450000,
            desc: "Giáp Nano từ Avengers: Infinity War. Độ chi tiết sắc sảo và hệ thống LED.",
            variants: [
                { option: "Standard Edition", priceMod: 1, stock: 25 },
                { option: "Accessory Pack Included", priceMod: 1.3, stock: 8 }
            ]
        },
        {
            name: "Hot Toys TMS051 Fennec Shand",
            brand: "Hot Toys",
            cat: "Action Figures",
            basePrice: 5800000,
            desc: "Mô hình tỉ lệ 1/6 cực kỳ chân thực của sát thủ Fennec Shand.",
            variants: [
                { option: "Normal Face", priceMod: 1, stock: 5 },
                { option: "Helmet Edition", priceMod: 1.1, stock: 2 }
            ]
        }
    ];

    // Tự động sinh thêm 50 sản phẩm dụng cụ / giá rẻ để test
    for (let i = 1; i <= 50; i++) {
        const isTool = i % 2 === 0;
        const brand = isTool ? "Tamiya" : "Mr. Hobby";
        retailItems.push({
            name: isTool ? `Dụng cụ cắt gọt mô hình Tamiya Pro ${i}` : `Sơn mô hình Mr.Hobby Màu ${i}`,
            brand: brand,
            cat: isTool ? "Professional Tools" : "Modeling Supplies",
            basePrice: 15000 + (Math.floor(Math.random() * 50) * 1000), // 15k - 65k (Rẻ để test)
            desc: `Sản phẩm phụ trợ số ${i} cực rẽ, dùng để test hệ thống thanh toán và đơn hàng.`,
            variants: [
                { option: "Mua lẻ 1 sản phẩm", priceMod: 1, stock: 200 },
                { option: "Combo tiết kiệm (3 sản phẩm)", priceMod: 2.5, stock: 100 }
            ]
        });
    }

    let countRetail = 0;
    for (const item of retailItems) {
        await prisma.products.create({
            data: {
                name: item.name,
                type_code: "RETAIL",
                status_code: "ACTIVE",
                category_id: catMap.get(item.cat),
                brand_id: brandMap.get(item.brand),
                description: item.desc,
                product_variants: {
                    create: item.variants.map((v, i) => ({
                        sku: `SKU-${Date.now()}-${countRetail}-${i}`,
                        option_name: v.option,
                        price: item.basePrice * v.priceMod,
                        cost_price: item.basePrice * v.priceMod * 0.75,
                        stock_available: v.stock,
                        weight_g: 500,
                        length_cm: 30, width_cm: 20, height_cm: 10,
                        scale: "1/100",
                        material: "Plastics/Metal"
                    }))
                }
            }
        });
        countRetail++;
    }
    console.log(`✅ Đã nạp xong ${countRetail} sản phẩm Retail (mỗi sản phẩm có ít nhất 2 biến thể).`);

    // 3. NẠP SẢN PHẨM PRE-ORDER (STOCK = 0)
    const preorderItems = [
        { name: "Metal Build Gundam Astray Red Frame Kai", price: 6500000, deposit: 1500000, date: "2026-12-25T00:00:00Z" },
        { name: "Hot Toys Iron Man Mark 85 (Reissue)", price: 8200000, deposit: 2000000, date: "2026-10-10T00:00:00Z" },
        { name: "PG Unleashed RX-178 Gundam Mk-II", price: 7200000, deposit: 1500000, date: "2027-01-15T00:00:00Z" },
        { name: "ThreeZero DLX Optimus Prime (ROTB)", price: 5800000, deposit: 1500000, date: "2026-11-30T00:00:00Z" }
    ];

    for (const p of preorderItems) {
        await prisma.products.create({
            data: {
                name: p.name,
                type_code: "PREORDER",
                status_code: "ACTIVE",
                category_id: catMap.get("Action Figures") || catMap.get("Model Kits"),
                brand_id: brandMap.get("Bandai") || brandMap.get("ThreeZero"),
                description: `Sản phẩm phiên bản giới hạn sắp ra mắt. Hãy đặt cọc ngay!`,
                product_variants: {
                    create: {
                        sku: `PRE-${Date.now()}-${p.name.substring(0,3).toUpperCase()}`,
                        option_name: "Pre-order Slot",
                        price: p.price,
                        cost_price: p.price * 0.7,
                        stock_available: 0, // Yêu cầu từ user: set cứng = 0
                        weight_g: 1000,
                        product_preorder_configs: {
                            create: {
                                deposit_amount: p.deposit,
                                full_price: p.price,
                                release_date: p.date,
                                total_slots: 50,
                                sold_slots: 0,
                                max_qty_per_user: 2,
                                stock_held: 0
                            }
                        }
                    }
                }
            }
        });
    }
    console.log(`✅ Đã nạp xong ${preorderItems.length} sản phẩm Pre-order chuẩn bị test mua hàng.`);

    // Lưu ý: Không tạo sản phẩm BLINDBOX theo yêu cầu!

    console.log('🎉 QUÁ TRÌNH NẠP DỮ LIỆU MỚI HOÀN TẤT!');
}

main()
    .catch((e) => {
        console.error('❌ Lỗi nạp dữ liệu:', e);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
