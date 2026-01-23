import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { SystemModule } from './system/system.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { StaffModule } from './staff/staff.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { BrandsModule } from './brands/brands.module';
import { SeriesModule } from './series/series.module';
import { OrdersModule } from './orders/orders.module';
import { ShipmentsModule } from './shipments/shipments.module';
import { CartModule } from './cart/cart.module';
import { MarketingModule } from './marketing/marketing.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PosModule } from './pos/pos.module';
import { InventoryModule } from './inventory/inventory.module';
import { FinanceModule } from './finance/finance.module';
import { AuctionsModule } from './auctions/auctions.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [PrismaModule, SystemModule, AuthModule, UsersModule, StaffModule, ProductsModule, CategoriesModule, BrandsModule, SeriesModule, OrdersModule, ShipmentsModule, CartModule, MarketingModule, NotificationsModule, PosModule, InventoryModule, FinanceModule, AuctionsModule, ChatModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
