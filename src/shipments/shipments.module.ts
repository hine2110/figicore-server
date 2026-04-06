import { Module } from '@nestjs/common';
import { ShipmentsService } from './shipments.service';
import { ShipmentsController } from './shipments.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { EncryptionService } from '../common/encryption.service';

@Module({
  imports: [HttpModule, ConfigModule],
  controllers: [ShipmentsController],
  providers: [ShipmentsService, EncryptionService],
})
export class ShipmentsModule { }
