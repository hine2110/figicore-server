import { Module } from '@nestjs/common';
import { CheckInService } from './check-in.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CheckInController } from './check-in.controller';
import { MailModule } from '../mail/mail.module';

@Module({
    imports: [PrismaModule, MailModule],
    controllers: [CheckInController],
    providers: [CheckInService],
    exports: [CheckInService],
})
export class CheckInModule { }
