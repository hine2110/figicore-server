import { Module } from '@nestjs/common';
import { ProductPromotionsService } from './product-promotions.service';
import { ProductPromotionsController } from './product-promotions.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ProductPromotionsController],
  providers: [ProductPromotionsService],
})
export class ProductPromotionsModule {}
