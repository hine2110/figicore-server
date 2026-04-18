import { Module, forwardRef } from '@nestjs/common';
import { AuctionsService } from './auctions.service';
import { AuctionsController } from './auctions.controller';
import { AuctionsGateway } from './auctions.gateway';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';
import { EncryptionService } from '../common/encryption.service';

@Module({
  imports: [forwardRef(() => OrdersModule), NotificationsModule, MailModule],
  controllers: [AuctionsController],
  providers: [AuctionsService, AuctionsGateway, EncryptionService],
  exports: [AuctionsService],
})
export class AuctionsModule { }
