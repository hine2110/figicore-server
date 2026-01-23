
import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

@Module({
    imports: [
        ConfigModule, // Ensure ConfigModule is available if we use ConfigService, or we can use process.env directly
        MailerModule.forRootAsync({
            // imports: [ConfigModule], // If using ConfigService
            // inject: [ConfigService],
            useFactory: () => ({
                transport: {
                    host: process.env.MAIL_HOST,
                    port: 587, // Standard SMTP port, or use env if needed
                    secure: false, // true for 465, false for other ports
                    auth: {
                        user: process.env.MAIL_USER,
                        pass: process.env.MAIL_PASS,
                    },
                },
                defaults: {
                    from: `"No Reply" <${process.env.MAIL_FROM}>`,
                },
            }),
        }),
    ],
    providers: [MailService],
    exports: [MailerModule, MailService], // Export MailerModule so MailerService is available
})
export class MailModule { }
