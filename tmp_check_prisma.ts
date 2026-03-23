import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
console.log(Object.keys(prisma).filter(key => !key.startsWith('_')));
process.exit(0);
