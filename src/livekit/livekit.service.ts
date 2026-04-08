import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AccessToken } from 'livekit-server-sdk';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LivekitService {
  constructor(private configService: ConfigService) {}

  async createToken(roomName: string, participantName: string, isHost: boolean, identity?: string) {
    const apiKey = this.configService.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET');

    if (!apiKey || !apiSecret) {
      throw new Error('LiveKit API key or secret is not configured');
    }

    if (!roomName || !participantName) {
      throw new UnauthorizedException('Room name and participant name are required');
    }

    const finalIdentity = identity || participantName.replace(/\s+/g, '_');

    const at = new AccessToken(apiKey, apiSecret, {
      identity: finalIdentity,
      name: participantName,
      ttl: '2h',
    });

    if (isHost) {
      at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
      });
    } else {
      at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: false,
        canSubscribe: true,
        hidden: false, 
      });
    }

    return await at.toJwt();
  }
}
