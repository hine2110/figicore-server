import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { KiotVietModule } from 'src/kiotviet/kiotviet.module';

@Module({
  imports: [KiotVietModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule { }
