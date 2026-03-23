"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('Verifying Prisma Client...');
    if ('product_variants' in prisma) {
        console.log('✅ product_variants model found.');
    }
    else {
        console.error('❌ product_variants model NOT found.');
    }
    if ('product_blindboxes' in prisma) {
        console.log('✅ product_blindboxes model found.');
    }
    else {
        console.error('❌ product_blindboxes model NOT found.');
    }
    if ('product_preorders' in prisma) {
        console.log('✅ product_preorders model found.');
    }
    else {
        console.error('❌ product_preorders model NOT found.');
    }
    console.log('Prisma Client verification complete.');
}
main()
    .catch(e => console.error(e))
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=verify-prisma.js.map