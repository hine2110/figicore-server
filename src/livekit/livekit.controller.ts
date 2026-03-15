import { Controller, Get, Query, UnauthorizedException } from '@nestjs/common';
import { LivekitService } from './livekit.service';
import { AuctionsService } from '../auctions/auctions.service';

@Controller('livekit')
export class LivekitController {
  constructor(
      private readonly livekitService: LivekitService,
      private readonly auctionsService: AuctionsService
    ) {}

  @Get('token')
  async getToken(
    @Query('room') room: string,
    @Query('username') username: string,
    @Query('isHost') isHostStr: string,
  ) {
    if (!room || !username) {
      throw new UnauthorizedException('Missing required parameters');
    }

    const isHost = isHostStr === 'true';

    // [Total Lockdown Check] If Admin wants to host, verify room is not archived
    if (isHost && room.startsWith('auction_')) {
        const auctionId = parseInt(room.replace('auction_', ''));
        if (!isNaN(auctionId)) {
            const auction = await this.auctionsService.findOne(auctionId);
            if (!auction || ['COMPLETED', 'CANCELLED', 'FAILED_NO_BUYER'].includes(auction.status_code)) {
                throw new UnauthorizedException('This auction session has been closed. Re-streaming is not allowed.');
            }
        }
    }

    const token = await this.livekitService.createToken(room, username, isHost);

    return { token };
  }
}
