const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient();

async function testWebhook() {
    try {
        const orderGroup = await prisma.orders.findFirst({
            where: {
                status_code: { in: ['PENDING_PAYMENT', 'WAITING_DEPOSIT'] },
                payment_ref_code: { startsWith: 'PAY-' }
            },
            select: { payment_ref_code: true }
        });

        if (!orderGroup) {
            console.log('No pending group payments found.');
            return;
        }

        const refCode = orderGroup.payment_ref_code;
        console.log(`Found pending group: ${refCode}`);

        const ordersInGroup = await prisma.orders.findMany({
            where: { payment_ref_code: refCode }
        });

        const totalAmount = ordersInGroup.reduce((sum, o) => sum + Number(o.total_amount), 0);
        console.log(`Simulating webhook for ${refCode} with amount ${totalAmount}`);

        const payload = {
            id: Math.floor(Math.random() * 1000000),
            gateway: 'MB',
            transactionDate: new Date().toISOString(),
            accountNumber: '0935655266',
            transferAmount: totalAmount,
            referenceCode: `TESTREF${Date.now()}`,
            content: `FIGI ${refCode}`
        };

        const res = await axios.post('http://localhost:3000/payments/sepay-webhook', payload);
        console.log('Webhook Response:', res.data);

        const updatedOrders = await prisma.orders.findMany({
            where: { payment_ref_code: refCode },
            select: { order_id: true, status_code: true }
        });
        console.log('Updated Orders:', updatedOrders);

    } catch (error) {
        if (error.response) {
            console.error('Test failed with response:', error.response.status, error.response.data);
        } else {
            console.error('Test failed with error:', error.message);
        }
    } finally {
        await prisma.$disconnect();
    }
}

testWebhook();
