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

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req, @Res() res) {
    const result = await this.authService.googleLogin(req.user);
    // Redirect to frontend or return JSON. User requirement says "generate JWT and return (or redirect)".
    // Returning JSON is cleaner for API testing, but usually browser expects redirect.
    // I'll return JSON for now as it's an API. 
    // Use res.json(result);
    // But @Res() puts me in manual mode. 
    // Better: return result directly without @Res? Validation: Passport strategy returns 'user' object to Request.
    // AuthGuard('google') executes validate(), returns user, assigns to req.user.
    // So req.user is the User Entity entity from DB (returned by validateGoogleUser in AuthService called by Strategy? Wait.)
    // Strategy validate() calls check? No, Strategy validate defined in file returns a payload object.
    // Strategy needs to call authService to find/create user.
    // I need to update GoogleStrategy to call AuthService.validateGoogleUser

    // Wait, step 3 "In validate(), just return the profile object for now". 
    // And in `google/callback`: "generate JWT". 
    // So the previous step WAS correct. Strategy returns profile. I need to handle DB Logic in Controller or Guard? 
    // Usually Strategy calls AuthService.validateUser. 
    // User Instructions: 
    // "Step 2: Implement AuthService Logic ... 4. validateGoogleUser ... Logic for Google Strategy"
    // "Step 3: ... GET /auth/google/callback ... generate JWT"
    // If Strategy returns profile, then `req.user` is profile.
    // Then `authService.googleLogin(req.user)` needs to handle the logic of "Check if email exists... Create user".
    // My implemented `validateGoogleUser` does exactly that. So I should call THAT method here first, then generate JWT.

    const user = await this.authService.validateGoogleUser(req.user);
    return res.json(await this.authService.googleLogin(user));
  }
}
