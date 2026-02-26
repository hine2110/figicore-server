import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const order = await prisma.orders.findFirst({
        orderBy: { order_id: 'desc' },
        include: {
            order_items: {
                include: { product_variants: true }
            }
        }
    });

    if (order) {
        const items = order.order_items.map(i => ({
            sku: i.product_variants.sku,
            weight: i.product_variants.weight_g,
            length: i.product_variants.length_cm,
            width: i.product_variants.width_cm,
            height: i.product_variants.height_cm,
            price: Number(i.unit_price),
            qty: i.quantity
        }));
        console.log(JSON.stringify(items, null, 2));
    } else {
        console.log('No order found');
    }
}

main().finally(() => prisma.$disconnect());
