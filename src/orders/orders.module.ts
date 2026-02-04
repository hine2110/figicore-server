import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { CustomersModule } from '../customers/customers.module';
import { AddressModule } from '../address/address.module';
import { MailModule } from '../mail/mail.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [AddressModule, CustomersModule, MailModule, EventsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule { }
