
import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
    constructor(private mailerService: MailerService) { }

    async sendVerificationEmail(email: string, token: string) {
        const url = `http://localhost:3000/auth/verify?token=${token}`;

        await this.mailerService.sendMail({
            to: email,
            subject: 'Welcome to FigiCore! Confirm your Email',
            html: `
        <h3>Welcome to FigiCore</h3>
        <p>Please click the link below to confirm your email:</p>
        <p><a href="${url}">Confirm Email</a></p>
        <p>This link is valid for 24 hours.</p>
      `,
        });
    }

    async sendOtpEmail(email: string, otp: string) {
        await this.mailerService.sendMail({
            to: email,
            subject: 'FigiCore Verification Code',
            html: `
        <h3>FigiCore Verification</h3>
        <p>Your verification code is:</p>
        <h2>${otp}</h2>
        <p>This code expires in 5 minutes.</p>
      `,
        });
    }

    async sendPasswordResetEmail(email: string, name: string, resetLink: string) {
        await this.mailerService.sendMail({
            to: email,
            subject: 'Reset Your Password - FigiCore',
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Hi ${name},</h2>
          <p>You requested to reset your password for your FigiCore account.</p>
          <p>Click the button below to reset your password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" 
               style="background-color: #3B82F6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p style="color: #666;">This link expires in <strong>1 hour</strong>.</p>
          <p style="color: #666;">If you didn't request this, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px;">© 2026 FigiCore. All rights reserved.</p>
        </div>
      `,
        });
    }
    async sendEmployeeActivation(to: string, tempPass: string, token: string) {
        // Use environment variable for Frontend URL, fallback to localhost if not set (though .env is required)
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const activationLink = `${frontendUrl}/auth/activate?token=${token}`;

        await this.mailerService.sendMail({
            to: to,
            from: process.env.MAIL_FROM, // Ensure sender is set correctly
            subject: 'Kích hoạt tài khoản nhân viên FigiCore',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                    <h2 style="color: #111;">Chào mừng gia nhập đội ngũ FigiCore!</h2>
                    <p>Tài khoản của bạn đã được khởi tạo. Dưới đây là thông tin đăng nhập tạm thời:</p>
                    
                    <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Email:</strong> ${to}</p>
                        <p style="margin: 5px 0;"><strong>Mật khẩu tạm:</strong> <span style="font-family: monospace; font-size: 16px; background: #eee; padding: 2px 6px; border-radius: 4px;">${tempPass}</span></p>
                    </div>

                    <p>Vui lòng nhấp vào nút bên dưới để đổi mật khẩu và kích hoạt tài khoản:</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${activationLink}" 
                           style="background-color: #000; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                           Kích Hoạt Tài Khoản
                        </a>
                    </div>
                    
                    <p style="color: #666; font-size: 14px;">Liên kết này sẽ hết hạn sau 24 giờ.</p>
                    <p style="color: #999; font-size: 12px; margin-top: 30px;">Hệ thống FigiCore</p>
                </div>
            `,
        });
    }
}
