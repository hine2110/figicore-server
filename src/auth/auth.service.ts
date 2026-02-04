
import { Injectable, BadRequestException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { MailService } from '../mail/mail.service';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private mailService: MailService,
    private prisma: PrismaService,
  ) { }

  async sendOtpForRegistration(registerDto: RegisterDto) {
    let user = await this.usersService.findByEmail(registerDto.email);

    if (user && user.status_code === 'ACTIVE') {
      throw new BadRequestException('Email already registered');
    }

    const saltOrRounds = 10;
    const items = [1, 2, 3, 4, 5, 6];
    const hash = await bcrypt.hash(registerDto.password, saltOrRounds);

    // Generate 6 digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    if (user) {
      // User exists but Inactive -> Update
      await this.usersService.update(user.user_id, {
        password_hash: hash,
        full_name: registerDto.fullName,
        phone: registerDto.phone,
        otp_code: otp,
        otp_expires_at: otpExpiresAt,
      });
    } else {
      // Create new user
      await this.usersService.create({
        email: registerDto.email,
        password_hash: hash,
        full_name: registerDto.fullName,
        phone: registerDto.phone,
        role_code: 'CUSTOMER',
        status_code: 'INACTIVE',
        is_verified: false,
        otp_code: otp,
        otp_expires_at: otpExpiresAt,
      });
    }

    await this.mailService.sendOtpEmail(registerDto.email, otp);

    return { message: 'OTP sent to your email. Please verify to complete registration.' };
  }

  async register(verifyOtpDto: { email: string, otp: string }) {
    const user = await this.usersService.findByEmail(verifyOtpDto.email);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.status_code === 'ACTIVE') {
      throw new BadRequestException('User already active');
    }

    if (user.otp_code !== verifyOtpDto.otp) {
      throw new BadRequestException('Invalid OTP');
    }

    if (!user.otp_expires_at || new Date() > user.otp_expires_at) {
      throw new BadRequestException('OTP expired');
    }

    // Activate User
    await this.usersService.update(user.user_id, {
      status_code: 'ACTIVE',
      is_verified: true,
      otp_code: null,
      otp_expires_at: null,
    });

    // Auto Login
    const payload = {
      email: user.email,
      sub: user.user_id,
      role: user.role_code,
      fullName: user.full_name
    };

    return {
      message: 'Registration successful',
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.user_id,
        email: user.email,
        role_code: user.role_code,
        fullName: user.full_name,
      },
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid email');
    }

    if (user.password_hash) {
      const isMatch = await bcrypt.compare(loginDto.password, user.password_hash);
      if (!isMatch) {
        throw new UnauthorizedException('Invalid password');
      }
    } else {
      // User might have registered via Google (no password)
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status_code !== 'ACTIVE') {
      throw new UnauthorizedException('Account not active. Please verify your email.');
    }

    const payload = {
      email: user.email,
      sub: user.user_id,
      role_code: user.role_code,
      full_name: user.full_name
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.user_id,
        email: user.email,
        role_code: user.role_code,
        fullName: user.full_name,
      },
    };
  }


  async validateGoogleUser(details: any) {
    // 1. Check by Google ID (Best Practice)
    let user = await this.prisma.users.findFirst({
      where: { google_id: details.googleId },
    });

    if (user) {
      return user; // Known Google User
    }

    // 2. Check by Email (Account Linking)
    user = await this.usersService.findByEmail(details.email);

    if (user) {
      // Link Google ID to existing account
      console.log(`Linking Google ID for user ${user.email}`);
      return this.usersService.update(user.user_id, {
        google_id: details.googleId,
        avatar_url: details.picture || user.avatar_url, // Update avatar if available
        is_verified: true,
      });
    }

    // 3. Create New User (Schema Constraints Relaxed)
    console.log('Creating new Google user...');
    return this.usersService.create({
      email: details.email,
      google_id: details.googleId,
      full_name: `${details.firstName} ${details.lastName}`.substring(0, 100),
      avatar_url: details.picture,
      role_code: 'CUSTOMER',
      status_code: 'ACTIVE',
      is_verified: true,
      // Phone & Password can be null now
      phone: undefined,
      password_hash: undefined,
    });
  }

  /*
   * Reusing existing login logic but strictly just generating tokens.
   * Note: The standard login checks passwords, but here we trust Google strategy
   * which calls validateGoogleUser -> returns user.
   * So we just need a method to sign tokens for an ALREADY VALIDATED user object.
   */
  async loginGoogleUser(user: any) {
    const payload = {
      email: user.email,
      sub: user.user_id,
      role_code: user.role_code,
      full_name: user.full_name
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.user_id,
        email: user.email,
        role_code: user.role_code,
        fullName: user.full_name,
      },
    };
  }

  async getUserById(userId: number) {
    const user = await this.prisma.users.findUnique({
      where: { user_id: userId },
      include: { customers: true }
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    // Return user without sensitive data if needed, or full user object
    return user;
  }

  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new NotFoundException('Email not found');
    }

    // Check if user role is allowed to use forgot password
    const ALLOWED_ROLES = ['CUSTOMER', 'MANAGER', 'STAFF_POS', 'STAFF_INVENTORY'];
    if (!ALLOWED_ROLES.includes(user.role_code)) {
      throw new BadRequestException('This feature is not available for your account role. Please contact system administrator.');
    }

    // Create reset token (expires in 1 hour)
    const resetToken = this.jwtService.sign(
      { email, type: 'password-reset' },
      { expiresIn: 3600 }
    );

    // Send email with reset link
    const resetLink = `${process.env.FRONTEND_URL}/guest/reset-password?token=${resetToken}`;
    await this.mailService.sendPasswordResetEmail(user.email!, user.full_name || 'User', resetLink);

    return { message: 'Password reset link sent to your email' };
  }

  async resetPassword(token: string, newPassword: string) {
    try {
      // Verify token
      const payload = this.jwtService.verify(token);
      if (payload.type !== 'password-reset') {
        throw new UnauthorizedException('Invalid token');
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update password in database
      const user = await this.usersService.findByEmail(payload.email);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      await this.usersService.update(user.user_id, {
        password_hash: hashedPassword
      });

      return { message: 'Password reset successfully' };
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Reset link has expired');
      }
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}