
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor() {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: process.env.JWT_SECRET || 'secretKey', // Use env in production
        });
    }

    async validate(payload: any) {
        return {
            user_id: payload.sub,
            email: payload.email,
            role_code: payload.role_code,
            full_name: payload.full_name
        };
    }
}
