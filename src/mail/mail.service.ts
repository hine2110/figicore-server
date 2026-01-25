
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
}
