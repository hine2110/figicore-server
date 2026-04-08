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
      
      if (!authToken) {
        throw new WsException('Unauthorized');
      }

      const payload = this.jwtService.verify(authToken);
      const user = await this.prisma.users.findUnique({
        where: { user_id: payload.sub || payload.user_id },
      });

      if (!user) {
        throw new WsException('Unauthorized');
      }

      client.user = user;
      return true;
    } catch (err) {
      throw new WsException('Unauthorized');
    }
  }
}
