"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    console.log(`System-wide Diagnostic`);
    try {
        const userCount = await prisma.users.count();
        console.log(`Total users: ${userCount}`);
        const auctionCount = await prisma.auctions.count();
        console.log(`Total auctions: ${auctionCount}`);
        const orderCount = await prisma.orders.count();
        console.log(`Total orders: ${orderCount}`);
        const participantCount = await prisma.auction_participants.count();
        console.log(`Total auction participants: ${participantCount}`);
        const bidCount = await prisma.auction_bids.count();
        console.log(`Total auction bids: ${bidCount}`);
        if (auctionCount > 0) {
            const topAuctions = await prisma.auctions.findMany({
                take: 5,
                orderBy: { updated_at: 'desc' }
            });
            console.log('\nRecent Auctions:');
            topAuctions.forEach(a => {
                console.log(`- ID: ${a.auction_id}, Status: ${a.status_code}, Winner: ${a.winner_id}`);
            });
        }
    }
    catch (err) {
        console.error(`DB Query Error:`, err);
    }
}
main()
    .catch(e => console.error(e))
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=check-orders.js.map