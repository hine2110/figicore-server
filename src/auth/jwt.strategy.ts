
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor() {
        const secret = process.env.JWT_SECRET || 'secretKey';
        console.log(`[JwtStrategy] Initialized with secret: ${secret.substring(0, 3)}***`);
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: secret,
        });
    }

    async validate(payload: any) {

        return {
            user_id: payload.sub,
            email: payload.email,
            role_code: payload.role_code,
            full_name: payload.full_name,
            // Map legacy fields if needed
            userId: payload.sub,
            id: payload.sub
        };
    }
}
