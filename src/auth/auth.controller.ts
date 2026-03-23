import { Controller, Post, Body, Get, Query, UseGuards, Req, Res, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthGuard } from '@nestjs/passport';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ActivateAccountDto } from './dto/activate-account.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { ResendActivationDto } from './dto/resend-activation.dto';

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

  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Post('activate')
  @UseInterceptors(FileInterceptor('file'))
  async activate(
    @Body() dto: ActivateAccountDto,
    @UploadedFile() file?: Express.Multer.File
  ) {
    return this.authService.activateAccount(dto, file);
  }

  @Post('resend-activation')
  async resendActivation(@Body() dto: ResendActivationDto) {
    return this.authService.resendActivation(dto);
  }

  @Post('update-password')
  @UseGuards(AuthGuard('jwt'))
  async updatePassword(@Req() req, @Body() dto: UpdatePasswordDto) {
    return this.authService.updatePassword(req.user.user_id, dto);
  }
}
