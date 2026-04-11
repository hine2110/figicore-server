import { Module, Global } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { MailService } from './mail.service';
import { join } from 'path';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EncryptionService } from '../common/encryption.service';

@Global()
@Module({
    imports: [
        NotificationsModule,
        PrismaModule,
        MailerModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: async (config: ConfigService) => ({
                transport: {
                    host: config.get('MAIL_HOST', 'smtp.gmail.com'),
                    port: Number(config.get('MAIL_PORT', 587)),
                    secure: config.get('MAIL_PORT') === '465', // Chỉ True nếu là 465
                    auth: {
                        user: config.get('MAIL_USER'),
                        pass: config.get('MAIL_PASS'),
                    },
                    tls: {
                        rejectUnauthorized: false // Fix common SSL handshake issues
                    }
                },
                defaults: {
                    from: config.get('MAIL_FROM', '"FigiCore" <noreply@figicore.com>'),
                },
                template: {
                    dir: join(__dirname, 'templates'),
                    adapter: new HandlebarsAdapter(),
                    options: {
                        strict: true,
                    },
                },
            }),
            inject: [ConfigService],
        }),
    ],
    providers: [MailService, EncryptionService],
    exports: [MailService],
})
export class MailModule { }
