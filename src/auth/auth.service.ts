
import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { MailService } from '../mail/mail.service';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private mailService: MailService,
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
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.password_hash) {
      const isMatch = await bcrypt.compare(loginDto.password, user.password_hash);
      if (!isMatch) {
        throw new UnauthorizedException('Invalid credentials');
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
      role: user.role_code,
      fullName: user.full_name
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

  async validateGoogleUser(profile: any) {
    const email = profile.email;
    let user = await this.usersService.findByEmail(email);

    if (user) {
      // User exists, return user.
      // Optionally update google_id or avatar if missing? 
      if (!user.google_id) {
        await this.usersService.update(user.user_id, { google_id: profile.accessToken, avatar_url: profile.picture }); // accessToken as placeholder for google_id or sub? profile usually has id. profile.sub is google id? 
        // Strategy returns user object: { email, firstName, lastName, picture, accessToken }
        // Converting structure...
      }
      return user;
    }

    // Create new user
    user = await this.usersService.create({
      email: email,
      full_name: `${profile.firstName} ${profile.lastName}`,
      password_hash: await bcrypt.hash(randomBytes(16).toString('hex'), 10), // Random password
      role_code: 'CUSTOMER',
      status_code: 'ACTIVE',
      is_verified: true,
      google_id: 'GOOGLE_AUTH', // Should be profile.id technically but strategy didn't return it
      phone: `G_${randomBytes(4).toString('hex')}`, // Dummy unique phone for Google Users since phone is unique??
      avatar_url: profile.picture,
    });

    return user;
  }

  // Helper for Controller
  async googleLogin(user: any) {
    if (!user) {
      throw new BadRequestException('Unauthenticated');
    }
    const payload = {
      email: user.email,
      sub: user.user_id,
      role: user.role_code,
      fullName: user.full_name
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
}
