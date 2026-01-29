import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// --- DATA POOLS ---
const BRANDS = ["Bandai", "Good Smile Company", "Hot Toys", "Kotobukiya", "Motor Nuclear", "Pop Mart", "ThreeZero", "Alter"];
const CATEGORIES = ["Gundam Kit", "Scale Figure", "Nendoroid", "Action Figure", "Resin Statue", "Mecha"];
const SERIES = ["Mobile Suit Gundam", "One Piece", "Dragon Ball Z", "Evangelion", "Genshin Impact", "Honkai: Star Rail", "Marvel Universe", "Transformers"];

const ADJECTIVES = ["Divine", "Supreme", "Eternal", "Crimson", "Shadow", "Strike", "Freedom", "Wing", "Unicorn", "Infinite"];
const NOUNS = ["Warrior", "Dragon", "Mecha", "Valkyrie", "Knight", "Samurai", "Buster", "Guardian", "Emperor", "Saber"];
const SUFFIXES = ["Ver. Ka", "Limited Edition", "Anniversary Ver.", "DX Set", "Metal Build", "Master Grade", "Perfect Grade"];

const IMAGES = [
    "https://images.unsplash.com/photo-1618331835717-801e976710b2?q=80&w=1000&auto=format&fit=crop", // Gundam dark
    "https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?w=1000&auto=format&fit=crop", // Gundam red
    "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1000&auto=format&fit=crop", // Toy close up
    "https://images.unsplash.com/photo-1566576912906-60034a605152?w=1000&auto=format&fit=crop", // Lego/Toy
    "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1000&auto=format&fit=crop", // Action figure
];

// --- HELPERS ---
const random = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomPrice = (min: number, max: number) => Math.floor(randomInt(min, max) / 10000) * 10000; // Round to 10k
const generateSKU = (prefix: string) => `${prefix}-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`;

async function main() {
    console.log("🌱 Starting Seeding Process...");

    // 1. Create Master Data (Brands, Categories, Series)
    // We use upsert to avoid errors if running multiple times
    const brandMap = new Map();
    for (const name of BRANDS) {
        const b = await prisma.brands.upsert({ where: { name }, update: {}, create: { name } });
        brandMap.set(name, b.brand_id);
    }

    const catMap = new Map();
    for (const name of CATEGORIES) {
        const c = await prisma.categories.upsert({
            where: { name },
            update: {},
            create: { name, slug: name.toLowerCase().replace(/ /g, '-') }
        });
        catMap.set(name, c.category_id);
    }

    const seriesMap = new Map();
    for (const name of SERIES) {
        const s = await prisma.series.upsert({ where: { name }, update: {}, create: { name } });
        seriesMap.set(name, s.series_id);
    }

    console.log("✅ Master Data Created.");

    // 2. Generate 100 RETAIL Products
    console.log("📦 Generating 100 RETAIL Products...");

    for (let i = 0; i < 100; i++) {
        const brandName = random(BRANDS);
        const name = `${random(ADJECTIVES)} ${random(NOUNS)} ${random(SUFFIXES)}`;
        const basePrice = randomPrice(500000, 8000000);

        // Random Images (1 to 4 images)
        const productImages = Array.from({ length: randomInt(2, 4) }, () => random(IMAGES));

        const product = await prisma.products.create({
            data: {
                name: name,
                type_code: "RETAIL",
                status_code: "ACTIVE",
                description: `Experience the ultimate detail with the ${name}. This masterpiece from ${brandName} features premium articulation and die-cast parts. Perfect for any collector.`,
                brand_id: brandMap.get(brandName),
                category_id: catMap.get(random(CATEGORIES)),
                series_id: seriesMap.get(random(SERIES)),
                media_urls: productImages, // JSON
                specifications: {
                    "Material": "PVC, ABS, Die-cast",
                    "Height": `${randomInt(14, 35)} cm`,
                    "Scale": `1/${randomInt(60, 144)}`,
                    "Release Date": "2025-01-15"
                },
                product_variants: {
                    create: [
                        {
                            option_name: "Standard Version",
                            sku: generateSKU("RET"),
                            price: basePrice,
                            stock_available: randomInt(5, 50),
                            media_assets: []
                        },
                        {
                            option_name: "Deluxe Version (w/ Effect Parts)",
                            sku: generateSKU("RET-DX"),
                            price: basePrice + 500000,
                            stock_available: randomInt(0, 10), // Some out of stock
                            media_assets: []
                        }
                    ]
                }
            }
        });
    }

    // 3. Generate 20 PREORDER Products
    console.log("⏳ Generating 20 PREORDER Products...");

    for (let i = 0; i < 20; i++) {
        const brandName = random(BRANDS);
        const name = `[PRE-ORDER] ${random(ADJECTIVES)} ${random(NOUNS)} Ver. 2.0`;
        const fullPrice = randomPrice(2000000, 15000000);
        const deposit = fullPrice * 0.2; // 20% deposit

        const product = await prisma.products.create({
            data: {
                name: name,
                type_code: "PREORDER",
                status_code: "ACTIVE",
                description: `Secure your ${name} today. This is a limited production run. Expected release date is late 2026.`,
                brand_id: brandMap.get(brandName),
                category_id: catMap.get(random(CATEGORIES)),
                series_id: seriesMap.get(random(SERIES)),
                media_urls: [random(IMAGES), random(IMAGES)],
                specifications: {
                    "Material": "Resin, PU",
                    "Height": "45 cm",
                    "Limit": "500 pieces worldwide"
                },
                // Create relation to product_preorders table
                product_preorders: {
                    create: {
                        deposit_amount: deposit,
                        full_price: fullPrice,
                        release_date: new Date('2026-12-25'),
                        max_slots: randomInt(50, 200)
                    }
                }
            }
        });
    }

    console.log("🎉 Seeding Completed! 120 Products added.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });