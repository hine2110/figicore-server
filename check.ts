import { PrismaClient } from '@prisma/client'; const prisma = new PrismaClient(); prisma.orders.count().then(console.log).finally(() => prisma.$disconnect());
