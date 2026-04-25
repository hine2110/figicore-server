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

        const isVideo = file.mimetype.startsWith('video');
        const publicId = `${isVideo ? 'ship_video' : 'banner'}_${Date.now()}`;
        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;

        if (isVideo) {
            // PREDICT URL for Video (Background Upload)
            const predictedUrl = `https://res.cloudinary.com/${cloudName}/video/upload/${folder}/${publicId}.mp4`;
            this.runIsolatedBackgroundUpload(file, folder, publicId);
            return {
                url: predictedUrl,
                type: 'VIDEO',
                public_id: publicId,
            };
        } else {
            // DIRECT UPLOAD for Images
            try {
                const result: any = await new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream(
                        {
                            folder: folder,
                            public_id: publicId,
                            resource_type: 'image',
                        },
                        (error, result) => {
                            if (error) return reject(error);
                            resolve(result);
                        }
                    );
                    const stream = new Readable();
                    stream.push(file.buffer);
                    stream.push(null);
                    stream.pipe(uploadStream);
                });

                return {
                    url: result.secure_url,
                    type: 'IMAGE',
                    public_id: result.public_id,
                };
            } catch (error) {
                console.error('Image Upload Error:', error);
                throw new BadRequestException('Failed to upload image to Cloudinary');
            }
        }
    }

    private runIsolatedBackgroundUpload(file: Express.Multer.File, folder: string, publicId: string) {
        // Run in next tick to not block the current request response
        setImmediate(async () => {
            try {
                console.log(`[Background Upload Started] ${publicId}`);
                
                await new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream(
                        {
                            folder: folder,
                            public_id: publicId,
                            resource_type: 'video',
                            chunk_size: 6000000,
                        },
                        (error, result) => {
                            if (error) return reject(error);
                            resolve(result);
                        }
                    );

                    const stream = new Readable();
                    stream.push(file.buffer);
                    stream.push(null);
                    
                    // Critical: catch errors on the pipe/stream to prevent crash
                    stream.pipe(uploadStream).on('error', (err) => {
                        console.error(`[Background Upload Pipe Error] ${publicId}:`, err);
                    });
                });

                console.log(`[Background Upload Completed] ${publicId}`);
            } catch (err) {
                // Isolated error: server stays alive, user already got their URL
                console.error(`[Background Upload Failed] ${publicId}:`, err);
            }
        });
    }

    // New method for direct streaming (Pass-through)
    createUploadStream(folder: string, resolve: any, reject: any) {
        return cloudinary.uploader.upload_stream(
            {
                folder: folder,
                resource_type: 'video',
                async: true, // Return URL immediately
            },
            (error, result) => {
                if (error || !result) return reject(error);
                resolve({
                    url: result.secure_url,
                    type: 'VIDEO',
                    public_id: result.public_id,
                });
            }
        );
    }

    getSignature(folder: string = 'figicore_shipments') {
        const timestamp = Math.round(new Date().getTime() / 1000);
        const signature = cloudinary.utils.api_sign_request(
            {
                timestamp: timestamp,
                folder: folder,
            },
            process.env.CLOUDINARY_API_SECRET!,
        );

        return {
            signature,
            timestamp,
            cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
            apiKey: process.env.CLOUDINARY_API_KEY!,
            folder,
        };
    }
}
