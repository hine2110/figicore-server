const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Seeding Mock Auctions Data...');

    // 1. Ensure Brand exists
    let brand = await prisma.brands.findFirst();
    if (!brand) {
        brand = await prisma.brands.create({
            data: {
                name: 'Bandai Spirits',
                description: 'Premium action figures and model kits.',
                logo_url: 'https://placehold.co/100',
                status_code: 'ACTIVE',
            }
        });
    }

    // 2. Ensure Category exists
    let category = await prisma.categories.findFirst();
    if (!category) {
        category = await prisma.categories.create({
            data: {
                name: 'Metal Build',
                description: 'High-end mecha figures.',
                image_url: 'https://placehold.co/100',
                status_code: 'ACTIVE',
            }
        });
    }

    // 3. Create Product 1 (Active Auction)
    const productActive = await prisma.products.create({
        data: {
            category_id: category.category_id,
            brand_id: brand.brand_id,
            name: 'RX-93 v Gundam (Titanium Finish)',
            type_code: 'AUCTION',
            status_code: 'ACTIVE',
            description: 'Exclusive Tokyo Base edition, never opened.',
            media_urls: JSON.stringify(['https://placehold.co/800x800/18181b/cb202d?text=RX-93+v+Gundam']),
            product_variants: {
                create: {
                    sku: `AUC-RX93-${Date.now()}`,
                    option_name: 'Tokyo Base Edition',
                    price: 5000000,
                    stock_available: 1,
                    weight_g: 1500,
                    scale: '1/100',
                    media_assets: JSON.stringify([{ url: 'https://placehold.co/800x800/18181b/cb202d?text=RX-93+v+Gundam' }])
                }
            }
        },
        include: { product_variants: true }
    });

    // 4. Create Product 2 (Upcoming Auction)
    const productUpcoming = await prisma.products.create({
        data: {
            category_id: category.category_id,
            brand_id: brand.brand_id,
            name: 'Evangelion Unit-01 (Night Combat Ver.)',
            type_code: 'AUCTION',
            status_code: 'ACTIVE',
            description: 'Extremely rare night combat version with fluorescent paint.',
            media_urls: JSON.stringify(['https://placehold.co/800x800/18181b/6366f1?text=EVA-01+Night']),
            product_variants: {
                create: {
                    sku: `AUC-EVA01-${Date.now()}`,
                    option_name: 'Night Combat',
                    price: 8000000,
                    stock_available: 1,
                    weight_g: 2000,
                    scale: 'Non-scale',
                    media_assets: JSON.stringify([{ url: 'https://placehold.co/800x800/18181b/6366f1?text=EVA-01+Night' }])
                }
            }
        },
        include: { product_variants: true }
    });

    // 5. Create Auctions
    const now = new Date();
    const later = new Date(now.getTime() + 60 * 60 * 1000); // +1 hour
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +24 hours

    // Active Auction
    const auctionActive = await prisma.auctions.create({
        data: {
            variant_id: productActive.product_variants[0].variant_id,
            start_price: 3000000,
            step_price: 200000,
            deposit_fee: 500000,
            max_participants: 50,
            start_time: new Date(now.getTime() - 10 * 60 * 1000), // Started 10 mins ago
            end_time: later,
            status_code: 'ACTIVE'
        }
    });

    // Upcoming Auction
    const auctionUpcoming = await prisma.auctions.create({
        data: {
            variant_id: productUpcoming.product_variants[0].variant_id,
            start_price: 5000000,
            step_price: 500000,
            deposit_fee: 1000000,
            max_participants: 20,
            start_time: later,
            end_time: tomorrow,
            status_code: 'UPCOMING'
        }
    });

    console.log('Seed completed successfully!');
    console.log('Active Auction:', auctionActive.auction_id);
    console.log('Upcoming Auction:', auctionUpcoming.auction_id);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
