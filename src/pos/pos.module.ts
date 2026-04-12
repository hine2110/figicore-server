import { Module } from '@nestjs/common';
import { PosService } from './pos.service';
import { PosController } from './pos.controller';
import { PosOrdersController } from './pos-orders.controller';
import { PosOrdersService } from './pos-orders.service';
import { CustomersModule } from '../customers/customers.module';
import { EncryptionService } from '../common/encryption.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [CustomersModule, UsersModule],
  controllers: [PosController, PosOrdersController],
  providers: [PosService, PosOrdersService, EncryptionService],
})
export class PosModule { }
