import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { GoogleStrategy } from './strategies/google.strategy';

@Module({
  imports: [
    UsersModule, // Required by AuthService logic
    MailModule,
    PassportModule.register({ defaultStrategy: 'jwt' }), // Critical: Register default strategy
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'secretKey',
      signOptions: { expiresIn: '60m' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GoogleStrategy, JwtAuthGuard],
  // ⚠️ CRITICAL: EXPORT EVERYTHING NEEDED BY GUARDS IN OTHER MODULES
  exports: [AuthService, JwtAuthGuard, PassportModule, JwtStrategy, JwtModule],
})
export class AuthModule { }
