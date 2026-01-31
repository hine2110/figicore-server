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
        // SECURITY CHECK: Always fetch latest user status from DB
        const user = await this.prisma.users.findUnique({
            where: { user_id: payload.sub },
            select: { user_id: true, email: true, role_code: true, full_name: true, status_code: true }
        });

        if (!user) {
             throw new UnauthorizedException('User not found');
        }

        if (user.status_code !== 'ACTIVE') {
            throw new UnauthorizedException('Account is not active (Status: ' + user.status_code + ')');
        }

        return {
            user_id: user.user_id,
            email: user.email,
            role_code: user.role_code,
            full_name: user.full_name,
            // Map legacy fields if needed
            userId: user.user_id,
            id: user.user_id
        };
    }
}
