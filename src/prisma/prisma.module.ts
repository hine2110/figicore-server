import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // <--- QUAN TRỌNG: Dòng này giúp Prisma dùng được ở mọi nơi
@Module({
  providers: [PrismaService],
  exports: [PrismaService], // Xuất ra cho các module khác dùng
})
export class PrismaModule { }