"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const latestUser = await prisma.users.findMany({
        orderBy: {
            created_at: 'desc',
        },
        take: 1,
        select: {
            user_id: true,
            full_name: true,
            status_code: true,
            phone: true,
            created_at: true,
        },
    });
    console.log('--- LATEST USER DATA ---');
    console.log(JSON.stringify(latestUser, null, 2));
    console.log('------------------------');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=check-user.js.map