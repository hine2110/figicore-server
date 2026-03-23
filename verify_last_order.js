"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const lastOrder = await prisma.orders.findFirst({
        orderBy: { created_at: 'desc' },
        where: { channel_code: 'POS' },
        include: {
            order_items: true
        }
    });
    if (!lastOrder) {
        console.log('No POS orders found.');
        return;
    }
    console.log('--- Last POS Order Verification ---');
    console.log(`Order Code: ${lastOrder.order_code}`);
    console.log(`Total Amount: ${lastOrder.total_amount}`);
    console.log(`Total Tax: ${lastOrder.total_tax} (Should be > 0 if items have tax)`);
    console.log(`Status: ${lastOrder.status_code}`);
    console.log('--- Items ---');
    lastOrder.order_items.forEach(item => {
        console.log(`- Product ID: ${item.variant_id} | Qty: ${item.quantity}`);
        console.log(`  Price: ${item.unit_price} | Total: ${item.total_price}`);
        console.log(`  Tax Rate: ${item.tax_rate}% | Tax Amount: ${item.tax_amount}`);
    });
}
main()
    .catch(e => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=verify_last_order.js.map