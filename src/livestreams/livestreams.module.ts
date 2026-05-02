import { Module, forwardRef } from '@nestjs/common';
import { LivestreamsService } from './livestreams.service';
import { LivestreamsController } from './livestreams.controller';
import { LivestreamLiveGateway } from './livestream-live.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { LivestreamsAiController } from './livestreams-ai.controller';
import { OrdersModule } from '../orders/orders.module';
import { GiveawaysService } from './giveaways.service';
import { CartModule } from '../cart/cart.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '7d' },
    }),
    forwardRef(() => OrdersModule),
    CartModule,
    ChatModule,
  ],
  controllers: [LivestreamsController, LivestreamsAiController],
  providers: [LivestreamsService, LivestreamLiveGateway, GiveawaysService],
  exports: [LivestreamsService, LivestreamLiveGateway, GiveawaysService],
})
export class LivestreamsModule {}
