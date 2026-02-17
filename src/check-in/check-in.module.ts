import { Module } from '@nestjs/common';
import { TimesheetsController } from './timesheets.controller';
import { FaceVerificationService } from './face-verification.service';
import { UploadModule } from '../upload/upload.module';
import { PrismaModule } from '../prisma/prisma.module';
import { HttpModule } from '@nestjs/axios';

@Module({
    imports: [UploadModule, PrismaModule, HttpModule],
    controllers: [TimesheetsController],
    providers: [FaceVerificationService],
    exports: [FaceVerificationService],
})
export class CheckInModule { }
