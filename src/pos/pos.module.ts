import { Module } from '@nestjs/common';
import { PosService } from './pos.service';
import { PosController } from './pos.controller';
import { PosOrdersController } from './pos-orders.controller';
import { PosOrdersService } from './pos-orders.service';

@Module({
  controllers: [PosController, PosOrdersController],
  providers: [PosService, PosOrdersService],
})
export class PosModule { }
