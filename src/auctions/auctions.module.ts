import { Module, forwardRef } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { AuctionsService } from './auctions.service';
import { AuctionsController } from './auctions.controller';
import { AuctionsGateway } from './auctions.gateway';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';
import { EncryptionService } from '../common/encryption.service';
import { AddressModule } from '../address/address.module';

@Module({
  imports: [forwardRef(() => OrdersModule), NotificationsModule, MailModule, AddressModule, ChatModule],
  controllers: [AuctionsController],
  providers: [AuctionsService, AuctionsGateway, EncryptionService],
  exports: [AuctionsService],
})
export class AuctionsModule { }
