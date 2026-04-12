
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🚀 CHIẾN DỊCH TỔNG LỰC: NẠP DỮ LIỆU SIÊU CẤP CHO FIGICORE...');

    // 1. DỊCH VỤ CHUẨN BỊ (BRANDS & CATEGORIES)
    const categoryNames = ["Model Kits", "Action Figures", "Professional Tools", "Modeling Supplies", "Display Accessories"];
    const brandNames = ["Bandai", "Moshow Toys", "Motor Nuclear", "ThreeZero", "Hot Toys", "Good Smile Company", "GodHand", "DSPIAE", "Stedi", "Mr.Hobby", "Tamiya", "Kotobukiya"];
    
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

    // 2. DANH SÁCH 50 SẢN PHẨM RETAIL (DỰ KIẾN)
    const retailItems = [
        // --- 1. BANDAI GUNDAM (15 ITEMS) ---
        {
            name: "PG Unleashed RX-78-2 Gundam",
            brand: "Bandai",
            cat: "Model Kits",
            price: 6500000,
            scale: "1/60",
            mat: "PVC, ABS, Die-cast",
            desc: "Đỉnh cao của công nghệ chế tác mô hình từ Bandai. PG Unleashed RX-78-2 mang đến trải nghiệm lắp ráp 5 giai đoạn tiến hóa, từ khung xương cơ bản đến lớp giáp hoàn thiện với hệ thống LED tích hợp lộng lẫy.",
            specs: { height: "30cm", features: ["LED Internal Lighting", "Multi-layered Frame", "Metal Parts"] },
            stockGood: 15, stockDefect: 2
        },
        {
            name: "MGEX Strike Freedom Gundam",
            brand: "Bandai",
            cat: "Model Kits",
            price: 3650000,
            scale: "1/100",
            mat: "PS, ABS, PP",
            desc: "Dòng Master Grade Extreme tập trung vào biểu cảm cao nhất của kim loại. Khung xương mạ vàng 3 lớp khác nhau tạo nên vẻ ngoài lộng lẫy chưa từng có cho Strike Freedom.",
            specs: { height: "19cm", features: ["Extreme Metallic Combination", "LED Unit included", "Water Slide Decals"] },
            stockGood: 25, stockDefect: 3
        },
        {
            name: "RG RX-93-v2 Hi-v Gundam",
            brand: "Bandai",
            cat: "Model Kits",
            price: 1350000,
            scale: "1/144",
            mat: "PVC, ABS",
            desc: "Mẫu Real Grade được đánh giá là xuất sắc nhất mọi thời đại. Hi-v Gundam sở hữu biên độ khớp cực rộng và độ chi tiết tương đương dòng PG thu nhỏ.",
            specs: { features: ["Advanced MS Joint", "Fin Funnel Deployment", "Rich Decals"] },
            stockGood: 40, stockDefect: 5
        },
        {
            name: "MG Sazabi Ver.Ka",
            brand: "Bandai",
            cat: "Model Kits",
            price: 2450000,
            scale: "1/100",
            mat: "PVC, ABS",
            desc: "Thiết kế huyền thoại của Hajime Katoki. Sazabi Ver.Ka là một mẫu mô hình đồ sộ với cơ chế mở giáp (Hatch Open) cực kỳ chi tiết.",
            specs: { weight: "1.2kg", features: ["Katoki Design", "Funnel Rack", "Chrome Parts"] },
            stockGood: 12, stockDefect: 1
        },
        {
            name: "MG Wing Gundam Zero EW Ver.Ka",
            brand: "Bandai",
            cat: "Model Kits",
            price: 1550000,
            scale: "1/100",
            mat: "PVC, ABS",
            desc: "Tái hiện đôi cánh thiên thần huyền thoại. Wing Zero EW Ver.Ka có khả năng biến hình sang dạng phi cơ (Neo Bird Mode) và hệ thống lông vũ sắc sảo.",
            specs: { features: ["Neo Bird Transformation", "Feather Shell mechanism", "Duo Buster Rifles"] },
            stockGood: 30, stockDefect: 4
        },
        {
            name: "RG MSN-04 Sazabi",
            brand: "Bandai",
            cat: "Model Kits",
            price: 1200000,
            scale: "1/144",
            mat: "PVC, ABS",
            desc: "Mẫu RG lớn nhất với khối lượng và độ chi tiết vượt trội. Sazabi 1/144 mang lại cảm giác chắc chắn và mạnh mẽ trên lòng bàn tay.",
            specs: { features: ["Life-sized detail", "Multi-stage hatch opening"] },
            stockGood: 20, stockDefect: 2
        },
        {
            name: "HG Calibarn Gundam",
            brand: "Bandai",
            cat: "Model Kits",
            price: 550000,
            scale: "1/144",
            mat: "PVC, ABS",
            desc: "Phù thủy tối thượng từ 'The Witch from Mercury'. Calibarn nổi bật với khẩu chổi thần kỳ Broom Rifle và hệ thống Escutcheon bits.",
            specs: { features: ["Permet Score 8+ Effect", "Broom Rifle included"] },
            stockGood: 100, stockDefect: 10
        },
        {
            name: "MG Gundam Barbatos",
            brand: "Bandai",
            cat: "Model Kits",
            price: 1100000,
            scale: "1/100",
            mat: "ABS, PVC",
            desc: "Master Grade tái hiện khung xương cơ khí Gundam Frame hoàn hảo nhất. Chi tiết piston chuyển động thật khi cử động khớp.",
            specs: { features: ["Working Hydraulic Pistons", "Full Inner Frame", "Iconic Mace Weapon"] },
            stockGood: 50, stockDefect: 5
        },
        {
            name: "RG God Gundam",
            brand: "Bandai",
            cat: "Model Kits",
            price: 1050000,
            scale: "1/144",
            mat: "Plastic",
            desc: "Mẫu mô hình có khả năng tạo dáng võ thuật đỉnh cao nhất lịch sử. Khung xương mô phỏng cơ bắp người cho phép thực hiện các tư thế cực khó.",
            specs: { features: ["Martial Arts Poseability", "Burning Finger parts", "Energy Ring effect"] },
            stockGood: 35, stockDefect: 4
        },
        {
            name: "PG Exia Gundam (Lighting Edition)",
            brand: "Bandai",
            cat: "Model Kits",
            price: 7800000,
            scale: "1/60",
            mat: "Plastic, LED",
            desc: "Sự kết hợp hoàn hảo giữa công nghệ LED chuyển màu và cơ khí chính xác. Đèn LED có thể chuyển đổi từ xanh sang đỏ để mô phỏng trạng thái Trans-Am.",
            specs: { features: ["Color Changing LED", "GN Drive unit", "Silicon Band cable"] },
            stockGood: 5, stockDefect: 1
        },
        {
            name: "MG Freedom Gundam 2.0",
            brand: "Bandai",
            cat: "Model Kits",
            price: 1150000,
            scale: "1/100",
            mat: "Plastic",
            desc: "Biểu tượng của sự tự do. Mẫu 2.0 cải tiến toàn bộ hệ thống khớp và cánh, cho phép tạo những dáng bay lượn biểu cảm nhất.",
            specs: { features: ["Burst Mode wing", "Double Jointed Hip", "Lacus Figure included"] },
            stockGood: 45, stockDefect: 6
        },
        {
            name: "RG Epyon Gundam",
            brand: "Bandai",
            cat: "Model Kits",
            price: 1100000,
            scale: "1/144",
            mat: "Plastic",
            desc: "Sát thủ bóng đêm từ series Gundam Wing. Epyon RG sử dụng công nghệ Advanced MS Joint cho dây roi Heat Rod uốn lượn tự nhiên.",
            specs: { features: ["Heat Rod articulation", "Dragon Mode transformation"] },
            stockGood: 25, stockDefect: 3
        },
        {
            name: "MG Sinanju Stein (Narrative Ver.) Ver.Ka",
            brand: "Bandai",
            cat: "Model Kits",
            price: 1850000,
            scale: "1/100",
            mat: "Plastic",
            desc: "Thiết kế trang nhã nhưng đầy sức mạnh. Sinanju Stein Ver.Ka sở hữu tông màu trắng xám đặc trưng và các chi tiết chạm khắc 'Engraved' tinh xảo.",
            specs: { features: ["Engraved parts", "High Mobility Thrusters", "Shield & Beam Rifle"] },
            stockGood: 15, stockDefect: 2
        },
        {
            name: "HG Aerial Gundam (Permet Score Six)",
            brand: "Bandai",
            cat: "Model Kits",
            price: 650000,
            scale: "1/144",
            mat: "Plastic",
            desc: "Phiên bản giới hạn với hiệu ứng phát sáng xanh cực đẹp trên ngực và vai, mô phỏng khoảnh khắc Aerial đạt sức mạnh tối đa.",
            specs: { features: ["Blue Shell Unit parts", "Bit Stave combination"] },
            stockGood: 30, stockDefect: 5
        },
        {
            name: "MG Narrative Gundam C-Packs Ver.Ka",
            brand: "Bandai",
            cat: "Model Kits",
            price: 1650000,
            scale: "1/100",
            mat: "Plastic",
            desc: "Dòng Ver.Ka mới nhất 2024. Narrative Gundam với bộ giáp Psycho-Frame hồng rực rỡ và độ chi tiết cơ khí bậc thầy.",
            specs: { features: ["Clear Psycho-Frame", "Functional Cockpit", "Premium Decals"] },
            stockGood: 20, stockDefect: 2
        },

        // --- 2. METAL BUILD / HIGH-END (10 ITEMS) ---
        {
            name: "MOSHOW TOYS MCT-J02 Takeda Shingen",
            brand: "Moshow Toys",
            cat: "Action Figures",
            price: 3250000,
            scale: "1/72",
            mat: "Plastic, Die-cast",
            desc: "Đỉnh cao của dòng Metal Build từ Moshow. Takeda Shingen với khối lượng kim loại cực lớn, khớp nối chắc chắn và các chi tiết sơn mạ vàng lộng lẫy.",
            specs: { height: "29cm", material: "60% Die-cast", features: ["LED Eyes", "Extensive Armor details"] },
            stockGood: 10, stockDefect: 1
        },
        {
            name: "MOTOR NUCLEAR MNQ-XH01 Bai Qi",
            brand: "Motor Nuclear",
            cat: "Action Figures",
            price: 4500000,
            scale: "1/72",
            mat: "Die-cast, ABS",
            desc: "Sát Thần Bạch Khởi với đôi cánh pha lê khổng lồ. Sản phẩm đình đám của Motor Nuclear với độ hoàn thiện sơn phủ bề mặt cực kỳ cao cấp.",
            specs: { features: ["Crystal Wings", "Die-cast skeleton", "Multiple weapon sets"] },
            stockGood: 8, stockDefect: 1
        },
        {
            name: "MOSHOW TOYS MCT-E02 Lake Knight Lancelot",
            brand: "Moshow Toys",
            cat: "Action Figures",
            price: 3100000,
            scale: "1/100",
            mat: "Die-cast, ABS",
            desc: "Kỵ sĩ hồ nước với thiết kế trang nhã, tông màu xanh ngọc lục bảo sang trọng. Khung xương kim loại mang lại cảm giác cầm nắm đầm tay.",
            specs: { features: ["Sword of the Lake", "LED Head", "Display Base"] },
            stockGood: 12, stockDefect: 2
        },
        {
            name: "MOTOR NUCLEAR MNQ-05X Cao Ren",
            brand: "Motor Nuclear",
            cat: "Action Figures",
            price: 4200000,
            scale: "1/72",
            mat: "Die-cast, ABS",
            desc: "Hiện thân của sự kiên cường. Cao Ren sở hữu bộ giáp hầm hố và hệ thống biến hình sang dạng Phoenix cực kỳ ấn tượng.",
            specs: { features: ["Phoenix Mode Transformation", "Metal frame", "Heavy Shield"] },
            stockGood: 6, stockDefect: 1
        },
        {
            name: "MOSHOW TOYS MCT-AP02 Marquis of Wencheng",
            brand: "Moshow Toys",
            cat: "Action Figures",
            price: 3400000,
            scale: "1/72",
            mat: "Die-cast, ABS",
            desc: "Thiết kế mang đậm phong cách văn hóa phương Đông cổ đại kết hợp công nghệ robot tương lai.",
            specs: { features: ["Traditional Armor cues", "Magnetic LED switch"] },
            stockGood: 10, stockDefect: 1
        },
        {
            name: "ThreeZero Robo-Dou Evangelion Unit-01",
            brand: "ThreeZero",
            cat: "Action Figures",
            price: 3850000,
            scale: "25cm",
            mat: "Zink Alloy, ABS",
            desc: "Tái hiện Evangelion Unit-01 với 48 điểm khớp nối và hiệu ứng sơn phong hóa chân thực đặc trưng của ThreeZero.",
            specs: { features: ["Entry Plug opening", "Umbilical Cable included", "Bio-mechanical paint"] },
            stockGood: 15, stockDefect: 2
        },
        {
            name: "ThreeZero DLX Iron Man Mark 50",
            brand: "ThreeZero",
            cat: "Action Figures",
            price: 2450000,
            scale: "1/12",
            mat: "Die-cast, PVC",
            desc: "Giáp Nano từ Avengers: Infinity War. Độ chi tiết sắc sảo và hệ thống LED bố trí tại 5 vị trí khác nhau.",
            specs: { features: ["LED Chest & Eyes", "Nano-Repulsor Cannons", "Zink Alloy parts"] },
            stockGood: 20, stockDefect: 3
        },
        {
            name: "ThreeZero Robo-Dou Shin Getter 1",
            brand: "ThreeZero",
            cat: "Action Figures",
            price: 4100000,
            scale: "23cm",
            mat: "ABS, PVC, Metal",
            desc: "Robot khổng lồ Shin Getter 1 với thiết kế gân guốc, cơ bắp và hiệu ứng sơn giả kim loại cổ điển.",
            specs: { features: ["Getter Tomahawk", "Getter Scythe", "Glowing Paint effects"] },
            stockGood: 7, stockDefect: 1
        },
        {
            name: "Hot Toys TMS051 Fennec Shand",
            brand: "Hot Toys",
            cat: "Action Figures",
            price: 5800000,
            scale: "1/6",
            mat: "Fabric, PVC",
            desc: "Mô hình tỉ lệ 1/6 cực kỳ chân thực của sát thủ Fennec Shand từ series Star Wars: The Book of Boba Fett.",
            specs: { features: ["Hand-painted head sculpt", "Tailored costume", "Sniper Rifle"] },
            stockGood: 5, stockDefect: 0
        },
         {
            name: "Hot Toys DX25 Boba Fett",
            brand: "Hot Toys",
            cat: "Action Figures",
            price: 7500000,
            scale: "1/6",
            mat: "PVC, ABS, Fabric",
            desc: "Phiên bản Boba Fett ngồi trên ngai vàng của Jabba. Đây là mẫu sưu tầm cấp cao với hệ thống mắt đảo linh hoạt (Rolling Eyeballs).",
            specs: { features: ["Rolling Eyeballs system", "Armored Throne display", "Jetpack effects"] },
            stockGood: 3, stockDefect: 0
        },

        // --- 3. TOOLS & SUPPLIES (15 ITEMS) ---
        {
            name: "GodHand SPN-120 Ultimate Nipper",
            brand: "GodHand",
            cat: "Professional Tools",
            price: 1350000,
            scale: "Pro",
            mat: "Hardened Steel",
            desc: "Huyền thoại của làng mô hình. Kìm cắt một lưỡi siêu mỏng mang lại vết cắt phẳng mịn như gương, giúp tiết kiệm 90% thời gian chà nhám.",
            specs: { features: ["Single Blade technology", "Ultra-thin blade", "Protective cap included"] },
            stockGood: 30, stockDefect: 2
        },
        {
            name: "DSPIAE ST-A Single Blade Nipper",
            brand: "DSPIAE",
            cat: "Professional Tools",
            price: 850000,
            scale: "Precision",
            mat: "High Carbon Steel",
            desc: "Đối thủ trực tiếp của GodHand với độ bền lưỡi tốt hơn và giá thành hợp lý hơn cho người mới bắt đầu.",
            specs: { features: ["Tungsten Steel reinforced", "Ergonomic handles"] },
            stockGood: 50, stockDefect: 5
        },
        {
            name: "Stedi ST-A Single Blade Nipper",
            brand: "Stedi",
            cat: "Professional Tools",
            price: 550000,
            scale: "Standard",
            mat: "Chrome Moly Steel",
            desc: "Lựa chọn kinh tế nhất cho dòng kìm một lưỡi. Hiệu năng cắt vượt trội so với các loại kìm hai lưỡi thông thường.",
            specs: { features: ["Best price-performance", "Leather pouch included"] },
            stockGood: 70, stockDefect: 10
        },
        {
            name: "Tamiya Sharp Pointed Nipper (Blue)",
            brand: "Tamiya",
            cat: "Professional Tools",
            price: 680000,
            scale: "Durable",
            mat: "Alloy Steel",
            desc: "Kìm cắt bền bỉ bậc nhất thế giới. Thích hợp để cắt những phần cuống (runner) dày mà không sợ mẻ lưỡi.",
            specs: { features: ["High Durability", "Perfect for thick sprues"] },
            stockGood: 45, stockDefect: 3
        },
        {
            name: "Mr.Hobby Airbrush Procon Boy PS-289",
            brand: "Mr.Hobby",
            cat: "Professional Tools",
            price: 2850000,
            scale: "0.3mm",
            mat: "Chrome Metal",
            desc: "Bút vẽ mô hình chuyên dụng 0.3mm. Tiêu chuẩn vàng của các nhà xưởng mô hình Nhật Bản.",
            specs: { features: ["Double Action trigger", "Precision needle", "Gravity feed"] },
            stockGood: 10, stockDefect: 1
        },
        {
            name: "Mr.Color Thinner 400ml",
            brand: "Mr.Hobby",
            cat: "Modeling Supplies",
            price: 245000,
            scale: "400ml",
            mat: "Chemical Solvent",
            desc: "Dung môi pha sơn Lacquer tiêu chuẩn. Đảm bảo bề mặt sơn mịn màng và khô nhanh.",
            specs: { features: ["Quick drying", "Compatible with Gaia paint"] },
            stockGood: 120, stockDefect: 5
        },
        {
            name: "Tamiya Extra Thin Cement",
            brand: "Tamiya",
            cat: "Modeling Supplies",
            price: 115000,
            scale: "40ml",
            mat: "Liquid Cement",
            desc: "Keo dán nhựa siêu loãng. Tự động len lỏi vào khe hở nhờ lực mao dẫn, không để lại vết keo thừa.",
            specs: { features: ["Capillary action", "Quick bond"] },
            stockGood: 200, stockDefect: 0
        },
        {
            name: "DSPIAE Glass File - Sine Polisher",
            brand: "DSPIAE",
            cat: "Professional Tools",
            price: 185000,
            scale: "Nano",
            mat: "Tempered Glass",
            desc: "Giũa thủy tinh công nghệ Nano. Vừa mài ghẻ (nub mark) vừa đánh bóng bề mặt nhựa chỉ trong một bước.",
            specs: { features: ["Nano-grinding tech", "Washable", "Safe for plastic"] },
            stockGood: 85, stockDefect: 2
        },
        {
            name: "Mr.Hobby Gundam Marker Set - Basic",
            brand: "Mr.Hobby",
            cat: "Modeling Supplies",
            price: 325000,
            scale: "Set of 6",
            mat: "Alcohol Based Ink",
            desc: "Bộ bút tô màu cơ bản dành cho người mới chơi Gundam. Phù hợp để tô chi tiết nhỏ và mắt robot.",
            specs: { features: ["Basic Colors included", "Easy to apply"] },
            stockGood: 65, stockDefect: 0
        },
        {
            name: "Tamiya Panel Line Accent (Black)",
            brand: "Tamiya",
            cat: "Modeling Supplies",
            price: 155000,
            scale: "40ml",
            mat: "Enamel Ink",
            desc: "Sơn kẻ lằn chìm giúp làm nổi bật các rãnh máy móc trên mô hình một cách tự nhiên.",
            specs: { features: ["Pre-mixed ink", "Precision brush in cap"] },
            stockGood: 150, stockDefect: 1
        },
        {
            name: "DSPIAE AT-TH Multi-angle Hobby Vice",
            brand: "DSPIAE",
            cat: "Professional Tools",
            price: 1450000,
            scale: "Universal",
            mat: "Alloy",
            desc: "Ê-tô xoay đa hướng chuyên dụng. Cố định chi tiết nhỏ để đi lằn hoặc sơn tay cực kỳ chắc chắn.",
            specs: { features: ["360 degree rotation", "Heavy base", "Silicon grips"] },
            stockGood: 12, stockDefect: 1
        },
        {
            name: "Madworks Tungsten Steel Sciber 0.15mm",
            brand: "DSPIAE",
            cat: "Professional Tools",
            price: 450000,
            scale: "0.15mm",
            mat: "Tungsten Steel",
            desc: "Dao đi lằn siêu cứng làm từ thép Vonfram. Giúp tạo lại các rãnh cũ hoặc khắc rãnh mới sắc nét.",
            specs: { features: ["High Hardness", "Precision tip"] },
            stockGood: 25, stockDefect: 2
        },
        {
            name: "Action Base 4 Black",
            brand: "Bandai",
            cat: "Display Accessories",
            price: 185000,
            scale: "1/100, 1/144",
            mat: "Plastic",
            desc: "Đế trưng bày hỗ trợ các tư thế bay lượn cho Gundam. Hỗ trợ nhiều khớp nối khác nhau.",
            specs: { features: ["Modular design", "Stable support"] },
            stockGood: 90, stockDefect: 5
        },
         {
            name: "LED Unit Blue for PG/MG",
            brand: "Bandai",
            cat: "Display Accessories",
            price: 125000,
            scale: "Electronic",
            mat: "Plastic, LED",
            desc: "Đèn LED chính hãng của Bandai để thắp sáng mắt và ngực cho các mẫu Master Grade hoặc Perfect Grade.",
            specs: { features: ["Push button switch", "Blue light"] },
            stockGood: 55, stockDefect: 10
        },
        {
            name: "Mechanical Chain Base 01",
            brand: "Kotobukiya",
            cat: "Display Accessories",
            price: 480000,
            scale: "Non-scale",
            mat: "Plastic",
            desc: "Bối cảnh xưởng sửa chữa robot. Có thể ghép nhiều bộ để tạo thành một Workshop khổng lồ.",
            specs: { features: ["Connectable walls", "Hangar details"] },
            stockGood: 18, stockDefect: 2
        },

        // --- 4. MIXED FIGURES & MISC (10 ITEMS) ---
        {
            name: "Hot Toys TMS064 Echo (The Bad Batch)",
            brand: "Hot Toys",
            cat: "Action Figures",
            price: 6200000,
            scale: "1/6",
            mat: "PVC, Fabric",
            desc: "Nhân vật Echo từ series hoạt hình đình đám Star Wars: The Bad Batch với đầy đủ phụ kiện máy móc thay thế.",
            specs: { features: ["Mechanical arm", "Realistic head sculpt", "Armor plates"] },
            stockGood: 4, stockDefect: 0
        },
        {
            name: "Hot Toys MMS647 Doctor Strange",
            brand: "Hot Toys",
            cat: "Action Figures",
            price: 8500000,
            scale: "1/6",
            mat: "PVC, Fabric",
            desc: "Doctor Strange trong Multiverse of Madness. Đi kèm vô số hiệu ứng pháp thuật và đôi mắt thứ 3 tinh xảo.",
            specs: { features: ["Eye of Agamotto", "Cloak of Levitation", "Magic Mandalas"] },
            stockGood: 6, stockDefect: 0
        },
        {
            name: "Good Smile Nendoroid Marin Kitagawa",
            brand: "Good Smile Company",
            cat: "Action Figures",
            price: 1250000,
            scale: "Nendoroid",
            mat: "PVC",
            desc: "Mô hình chibi đáng yêu của nàng 'Wife' quốc dân Marin. Phụ kiện đi kèm gồm máy ảnh và túi xách thời trang.",
            specs: { features: ["Interchangeable faces", "Articulation points"] },
            stockGood: 35, stockDefect: 3
        },
        {
            name: "Good Smile POP UP PARADE Erza Scarlet",
            brand: "Good Smile Company",
            cat: "Action Figures",
            price: 950000,
            scale: "17cm",
            mat: "PVC",
            desc: "Dòng tượng chất lượng cao với giá thành cực mềm. Erza trong trang phục kỵ sĩ chiến đấu oai phong.",
            specs: { features: ["Fixed pose", "Clean paint finish"] },
            stockGood: 25, stockDefect: 2
        },
        {
            name: "ThreeZero DLX Black Panther",
            brand: "ThreeZero",
            cat: "Action Figures",
            price: 2550000,
            scale: "1/12",
            mat: "Die-cast, ABS",
            desc: "Chiến binh báo đen với bộ giáp dệt mịn màng và độ linh hoạt cực cao để thực hiện các tư thế chiến đấu đặc trưng.",
            specs: { features: ["Zink Alloy frame", "Energy effect parts"] },
            stockGood: 18, stockDefect: 2
        },
        {
            name: "Good Smile Figma Power (Chainsaw Man)",
            brand: "Good Smile Company",
            cat: "Action Figures",
            price: 1850000,
            scale: "Figma",
            mat: "PVC",
            desc: "Cô nàng ác quỷ máu tinh nghịch từ Chainsaw Man. Đi kèm chú mèo Nyako và vũ khí máu đỏ rực.",
            specs: { features: ["Nyako cat included", "Blood hammers", "Smooth joints"] },
            stockGood: 22, stockDefect: 2
        },
        {
            name: "Kotobukiya Megami Device Asra Archer",
            brand: "Kotobukiya",
            cat: "Model Kits",
            price: 1450000,
            scale: "1/1",
            mat: "Plastic",
            desc: "Sự kết hợp giữa nhân vật nữ anime và giáp kỵ sĩ cơ khí. Độ chi tiết giáp và vũ khí cung tên cực kỳ sắc sảo.",
            specs: { features: ["Armed & Unarmed mode", "Complex decals"] },
            stockGood: 15, stockDefect: 2
        },
        {
            name: "Kotobukiya Frame Arms Girl Stylet XF-3",
            brand: "Kotobukiya",
            cat: "Model Kits",
            price: 1550000,
            scale: "1/100",
            mat: "Plastic",
            desc: "Mẫu F.A.G cải tiến với hệ thống drone bay kèm và vũ khí hạng nặng mới.",
            specs: { features: ["Transformable drone", "Multiple facial expressions"] },
            stockGood: 10, stockDefect: 1
        },
        {
            name: "Good Smile POP UP PARADE Guts (Berserker Armor)",
            brand: "Good Smile Company",
            cat: "Action Figures",
            price: 1650000,
            scale: "28cm (L size)",
            mat: "PVC",
            desc: "Kiếm sĩ đen Guts trong bộ giáp điên cuồng. Kích thước lớn hơn hẳn các mẫu Pop Up Parade thông thường.",
            specs: { features: ["L-Size figure", "Dark paint wash", "Dragon Slayer sword"] },
            stockGood: 20, stockDefect: 3
        },
        {
            name: "Bandai Metal Build Hi-v Gundam",
            brand: "Bandai",
            cat: "Action Figures",
            price: 9500000,
            scale: "1/100",
            mat: "Die-cast, ABS",
            desc: "Siêu phẩm đã hoàn thiện sơn sẵn với khung xương kim loại nặng trịch. Đây là mơ ước của mọi nhà sưu tầm Gundam.",
            specs: { features: ["Real metal joints", "Luxury paint finish", "Heavy armament"] },
            stockGood: 4, stockDefect: 0
        }
    ];

    // 3. NẠP PRODUCT & VARIANTS
    let count = 0;
    for (const item of retailItems) {
        const formattedDesc = `${item.desc}\n\n**Thông số kỹ thuật:**\n* **Thương hiệu:** ${item.brand}\n* **Phân loại:** ${item.cat}\n* **Chất liệu:** ${item.mat}\n* **Tính năng:** ${item.specs.features?.join(', ') || 'N/A'}`;

        await prisma.products.create({
            data: {
                name: item.name,
                type_code: "RETAIL",
                status_code: "ACTIVE",
                category_id: catMap.get(item.cat),
                brand_id: brandMap.get(item.brand),
                description: formattedDesc,
                specifications: item.specs,
                product_variants: {
                    create: {
                        sku: `SKU-${Date.now()}-${count}`,
                        option_name: "Standard Edition",
                        price: item.price,
                        cost_price: item.price * 0.75,
                        stock_available: item.stockGood,
                        stock_defect: item.stockDefect,
                        weight_g: 500,
                        length_cm: 30, width_cm: 20, height_cm: 10,
                        scale: item.scale,
                        material: item.mat,
                        description: formattedDesc
                    }
                }
            }
        });
        count++;
        // console.log(`✅ [${count}/50] Added: ${item.name}`);
    }
    console.log(`✅ Đã nạp xong 50 sản phẩm Retail.`);

    // 4. NẠP SẢN PHẨM PRE-ORDER (7 ITEMS)
    const preorderItems = [
        { name: "Metal Build Gundam Astray Red Frame Kai", price: 6500000, deposit: 1500000, date: "2026-12-25T00:00:00Z" },
        { name: "Hot Toys Iron Man Mark 85 (Reissue)", price: 8200000, deposit: 2000000, date: "2026-10-10T00:00:00Z" },
        { name: "PG Unleashed RX-178 Gundam Mk-II", price: 7200000, deposit: 1500000, date: "2027-01-15T00:00:00Z" },
        { name: "MOSHOW MCT-J03 Date Masamune", price: 3500000, deposit: 1000000, date: "2026-09-20T00:00:00Z" },
        { name: "ThreeZero DLX Optimus Prime (ROTB)", price: 5800000, deposit: 1500000, date: "2026-11-30T00:00:00Z" },
        { name: "Nendoroid Furina (Genshin Impact)", price: 1350000, deposit: 300000, date: "2026-08-05T00:00:00Z" },
        { name: "RG Akatsuki Gundam (Oowashi Pack)", price: 1850000, deposit: 500000, date: "2026-11-15T00:00:00Z" }
    ];

    for (const p of preorderItems) {
        await prisma.products.create({
            data: {
                name: p.name,
                type_code: "PREORDER",
                status_code: "ACTIVE",
                category_id: catMap.get("Action Figures") || catMap.get("Model Kits"),
                brand_id: brandMap.get("Bandai") || brandMap.get("ThreeZero"),
                description: `Sản phẩm phiên bản giới hạn sắp ra mắt. Hãy đặt cọc ngay để đảm bảo có hàng sớm nhất với mức giá ưu đãi nhất.`,
                product_variants: {
                    create: {
                        sku: `PRE-${Date.now()}-${p.name.substring(0,3).toUpperCase()}`,
                        option_name: "Pre-order Slot",
                        price: p.price,
                        cost_price: p.price * 0.7,
                        stock_available: 50,
                        weight_g: 1000,
                        product_preorder_configs: {
                            create: {
                                deposit_amount: p.deposit,
                                full_price: p.price,
                                release_date: p.date,
                                total_slots: 50,
                                sold_slots: 0,
                                max_qty_per_user: 2
                            }
                        }
                    }
                }
            }
        });
    }
    console.log(`✅ Đã nạp xong 7 sản phẩm Pre-order.`);

    // 5. NẠP SẢN PHẨM BLINDBOX (5 TIERED)
    // Lấy ID một vài món hàng Retail xịn làm phần thưởng Big Win/Legendary
    const highEndVariants = await prisma.product_variants.findMany({
        where: { price: { gte: 3000000 } },
        take: 5
    });

    const commonVariants = await prisma.product_variants.findMany({
        where: { price: { lte: 1000000 } },
        take: 10
    });

    const blindboxConfigs = [
        { name: "Blindbox: Beginner Luck (350k)", price: 350000 },
        { name: "Blindbox: Collector Series (850k)", price: 850000 },
        { name: "Blindbox: Professional Gacha (1.5M)", price: 1500000 },
        { name: "Blindbox: Premium Whale (3.5M)", price: 3500000 },
        { name: "Blindbox: Legendary Artifacts (7M)", price: 7000000 }
    ];

    for (let i = 0; i < blindboxConfigs.length; i++) {
        const config = blindboxConfigs[i];
        
        // Cấu hình Tier mẫu
        const tierConfig = [
            { tier: "LEGENDARY", rate: 2, variants: [highEndVariants[i % highEndVariants.length]?.variant_id] },
            { tier: "BIG_WIN", rate: 5, variants: [highEndVariants[(i+1) % highEndVariants.length]?.variant_id] },
            { tier: "FAIR", rate: 23, variants: commonVariants.slice(0, 5).map(v => v.variant_id) },
            { tier: "COMMON", rate: 70, variants: commonVariants.slice(5, 10).map(v => v.variant_id) }
        ];

        const bb = await prisma.products.create({
            data: {
                name: config.name,
                type_code: "BLINDBOX",
                status_code: "ACTIVE",
                category_id: catMap.get("Model Kits"),
                brand_id: brandMap.get("Bandai"),
                description: `Thử thách vận may của bạn với gói Blindbox ${config.name}. Có cơ hội nhận được các sản phẩm giá trị lên tới hàng triệu đồng!`,
                product_blindboxes: {
                    create: {
                        price: config.price,
                        min_value: config.price * 0.5,
                        max_value: config.price * 5,
                        tier_config: tierConfig
                    }
                }
            }
        });
    }

    console.log(`✅ Đã nạp xong 5 sản phẩm Blindbox.`);
    console.log('🎉 TỔNG LỰC NẠP DỮ LIỆU HOÀN TẤT. CHÚC BẠN BẢO VỆ ĐỒ ÁN THÀNH CÔNG!');
}

main()
    .catch((e) => {
        console.error('❌ Seeding Error:', e);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
