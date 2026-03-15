import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LivekitService } from './livekit.service';
import { LivekitController } from './livekit.controller';
import { AuctionsModule } from '../auctions/auctions.module';

@Module({
  imports: [ConfigModule, AuctionsModule],
  providers: [LivekitService],
  controllers: [LivekitController]
})
export class LivekitModule {}
