import { Controller, Post, Body, Get, Query, UseGuards, Req, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthGuard } from '@nestjs/passport';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) { }

  @Post('send-otp')
  async sendOtp(@Body() registerDto: RegisterDto) {
    return this.authService.sendOtpForRegistration(registerDto);
  }

  @Post('register')
  async register(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.register(verifyOtpDto);
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  // @Get('verify') - Removed as we switched to OTP
  // async verify(@Query('token') token: string) {
  //   return this.authService.verifyEmail(token);
  // }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth(@Req() req) {
    // Initiates the Google OAuth flow
  }

  @Get('google/redirect')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req, @Res() res) {
    // 1. Validate / Create User in DB
    const user = await this.authService.validateGoogleUser(req.user);

    // 2. Generate Token
    const loginResult = await this.authService.loginGoogleUser(user);
    const token = loginResult.access_token;

    // 3. Redirect to Frontend
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(`${frontendUrl}/auth/success?token=${token}`);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async getProfile(@Req() req) {
    const user = await this.authService.getUserById(req.user.user_id);
    return user;
  }
}
