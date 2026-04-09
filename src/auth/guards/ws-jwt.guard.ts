import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client = context.switchToWs().getClient();
      const authToken = client.handshake?.auth?.token || client.handshake?.headers?.authorization?.split(' ')[1];
      
      console.log(`[WsJwtGuard] Checking token:`, authToken ? 'Exists' : 'MISSING');

      if (!authToken) {
        console.warn(`[WsJwtGuard] No auth token found in handshake`);
        throw new WsException('Unauthorized');
      }

      const payload = this.jwtService.verify(authToken);
      const user = await this.prisma.users.findUnique({
        where: { user_id: payload.sub || payload.user_id },
      });

      if (!user) {
        console.warn(`[WsJwtGuard] User not found for token payload:`, payload.sub || payload.user_id);
        throw new WsException('Unauthorized');
      }

      console.log(`[WsJwtGuard] Authenticated User:`, user.user_id);
      client.user = user;
      return true;
    } catch (err: any) {
      console.error(`[WsJwtGuard] Rejected: ${err.message}`);
      throw new WsException('Unauthorized');
    }
  }
}
