
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
}
