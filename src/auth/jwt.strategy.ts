import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(private prisma: PrismaService) {
        const secret = process.env.JWT_SECRET || 'secretKey';
        console.log(`[JwtStrategy] Initialized with secret: ${secret.substring(0, 3)}***`);
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: secret,
        });
    }

    async validate(payload: any) {
        const userId = Number(payload.sub || payload.id || payload.user_id);
        const user = await this.prisma.users.findUnique({ where: { user_id: userId } });

        if (!user) {
            throw new UnauthorizedException('User not found or session expired');
        }

        return {
            ...user, // Return full user object from DB
            user_id: user.user_id,
            userId: user.user_id,
            id: user.user_id
        };
    }
}
