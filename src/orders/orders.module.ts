import { Module, forwardRef } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { CustomersModule } from '../customers/customers.module';
import { AddressModule } from '../address/address.module';
import { MailModule } from '../mail/mail.module';
import { EventsModule } from '../events/events.module';
import { WalletModule } from '../wallet/wallet.module';
import { AuctionsModule } from '../auctions/auctions.module';
import { BlindboxesModule } from '../blindboxes/blindboxes.module';
import { LivestreamsModule } from '../livestreams/livestreams.module';
import { EncryptionService } from '../common/encryption.service';

@Module({
  imports: [
    AddressModule,
    CustomersModule,
    MailModule,
    EventsModule,
    WalletModule,
    BlindboxesModule,
    forwardRef(() => LivestreamsModule),
    forwardRef(() => AuctionsModule)
  ],
  controllers: [OrdersController],
  providers: [OrdersService, EncryptionService],
  exports: [OrdersService],
})
export class OrdersModule { }
