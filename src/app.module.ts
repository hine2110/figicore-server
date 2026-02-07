import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { MailModule } from './mail/mail.module';
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
import { AddressModule } from './address/address.module';
import { UploadModule } from './upload/upload.module';
import { EmployeesModule } from './employees/employees.module';
import { CustomersModule } from './customers/customers.module';
import { WorkSchedulesModule } from './work-schedules/work-schedules.module';
import { WorkSchedulesStaffModule } from './work-schedules-forStaff/work-schedules-staff.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { EventsModule } from './events/events.module';
import { CheckInModule } from './check-in/check-in.module';


import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({

  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),
    PrismaModule,
    SystemModule,
    AuthModule,
    UsersModule,
    StaffModule,
    ProductsModule,
    CategoriesModule,
    BrandsModule,
    SeriesModule,
    OrdersModule,
    ShipmentsModule,
    CartModule,
    MarketingModule,
    NotificationsModule,
    PosModule,
    InventoryModule,
    FinanceModule,
    AuctionsModule,
    ChatModule,
    MailModule,
    AddressModule,
    UploadModule,
    EmployeesModule,
    CustomersModule,
    WorkSchedulesModule,
    WorkSchedulesStaffModule,
    WebhooksModule,
    EventsModule,
    CheckInModule
  ],

  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
