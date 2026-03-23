import { Module } from '@nestjs/common';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';
import { FaceValidationService } from './face-validation.service';

@Module({
    controllers: [UploadController],
    providers: [UploadService, FaceValidationService],
    exports: [UploadService, FaceValidationService],
})
export class UploadModule { }
