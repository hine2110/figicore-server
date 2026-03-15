import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from '../prisma/prisma.module';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [ConfigModule, PrismaModule, ProductsModule],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
})
export class ChatModule { }
