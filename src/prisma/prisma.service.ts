import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    // Khi module khởi tạo -> Kết nối DB ngay lập tức
    async onModuleInit() {
        await this.$connect();
    }

    // Khi tắt server -> Ngắt kết nối sạch sẽ
    async onModuleDestroy() {
        await this.$disconnect();
    }
}