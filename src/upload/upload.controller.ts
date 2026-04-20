import { Controller, Post, UseInterceptors, UploadedFile, BadRequestException, Get, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';

@Controller('upload')
export class UploadController {
    constructor(private readonly uploadService: UploadService) { }

    @Get('signature')
    getSignature(@Query('folder') folder: string) {
        return this.uploadService.getSignature(folder);
    }

    @Post()
    @UseInterceptors(FileInterceptor('file', {
        limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
    }))
    async uploadFile(@UploadedFile() file: Express.Multer.File) {
        return await this.uploadService.uploadFile(file);
    }
}
