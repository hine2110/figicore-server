import { Injectable, BadRequestException } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class UploadService {
    constructor() {
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
        });
    }

    async uploadFile(file: Express.Multer.File, folder: string = 'figicore_products'): Promise<{ url: string; type: string; public_id: string }> {
        if (!file) throw new BadRequestException('No file provided');

        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: folder,
                    resource_type: 'auto', // Detect image or video
                },
                (error, result) => {
                    if (error || !result) {
                        return reject(error || new Error('Cloudinary upload failed: No result returned'));
                    }

                    resolve({
                        url: result.secure_url,
                        type: result.resource_type.toUpperCase(), // IMAGE or VIDEO
                        public_id: result.public_id,
                    });
                },
            );

            const stream = new Readable();
            stream.push(file.buffer);
            stream.push(null);
            stream.pipe(uploadStream);
        });
    }
}
