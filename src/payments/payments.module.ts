import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { LivestreamsModule } from '../livestreams/livestreams.module';
import { EncryptionService } from '../common/encryption.service';

@Module({
  imports: [LivestreamsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, EncryptionService],
  exports: [PaymentsService]
})
export class PaymentsModule { }
