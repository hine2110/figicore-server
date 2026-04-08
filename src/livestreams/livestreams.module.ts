import { Module } from '@nestjs/common';
import { LivestreamsService } from './livestreams.service';
import { LivestreamsController } from './livestreams.controller';
import { LivestreamLiveGateway } from './livestream-live.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { LivestreamsAiController } from './livestreams-ai.controller';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [LivestreamsController, LivestreamsAiController],
  providers: [LivestreamsService, LivestreamLiveGateway],
  exports: [LivestreamsService, LivestreamLiveGateway],
})
export class LivestreamsModule {}
