import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { KiotVietModule } from '../kiotviet/kiotviet.module';

import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [KiotVietModule, ConfigModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule { }
