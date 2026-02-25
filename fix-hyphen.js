const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient();

async function fixHyphensAndProcessUser() {
    try {
        // 1. Strip Hyphens from all existing pending payment_ref_code
        console.log("Fetching orders with hyphens in ref code...");
        const badOrders = await prisma.orders.findMany({
            where: {
                payment_ref_code: { contains: '-' },
                status_code: { in: ['PENDING_PAYMENT', 'WAITING_DEPOSIT'] }
            }
        });

        console.log(`Found ${badOrders.length} orders with hyphens. Updating...`);
        for (const order of badOrders) {
            if (order.payment_ref_code) {
                const cleanRef = order.payment_ref_code.replace(/-/g, '');
                await prisma.orders.update({
                    where: { order_id: order.order_id },
                    data: { payment_ref_code: cleanRef }
                });
                console.log(`Updated Order ${order.order_id}: ${order.payment_ref_code} -> ${cleanRef}`);
            }
        }

        // 2. Mock The Specific Webhook For The User
        console.log('Sending webhook for user payment PAY1771832145233399...');
        const payload = {
            id: 999999, // Fake SePay transaction ID
            gateway: 'MBBank',
            transactionDate: '2026-02-23 14:36:00',
            accountNumber: '0935655266',
            transferAmount: 40000,
            referenceCode: `MB${Date.now()}`,
            content: `FIGI PAY1771832145233399`
        };

        const res = await axios.post('http://localhost:3000/payments/sepay-webhook', payload);
        console.log('Webhook Response (User):', res.data);

    } catch (err) {
        if (err.response) {
            console.error(err.response.data);
        } else {
            console.error(err);
        }
    } finally {
        await prisma.$disconnect();
    }
}

fixHyphensAndProcessUser();
