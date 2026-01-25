const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testConnection() {
    try {
        await prisma.$connect();
        console.log('✅ Database connection successful!');

        const result = await prisma.$queryRaw`SELECT version()`;
        console.log('PostgreSQL version:', result);

        await prisma.$disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Database connection failed:');
        console.error('Error:', error.message);
        console.error('\nПожалуйста проверьте:');
        console.error('1. PostgreSQL service đang chạy');
        console.error('2. Username và password trong .env file');
        console.error('3. Database "figicore_db" đã được tạo');
        console.error('4. Port 5432 không bị block');
        process.exit(1);
    }
}

testConnection();
