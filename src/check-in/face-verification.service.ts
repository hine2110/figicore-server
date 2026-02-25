import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import FormData from 'form-data';

export interface VerificationResult {
    isMatch: boolean;
    confidence: number;
}

@Injectable()
export class FaceVerificationService {
    private readonly apiKey = process.env.FACEPLUSPLUS_API_KEY;
    private readonly apiSecret = process.env.FACEPLUSPLUS_API_SECRET;
    private readonly apiUrl = process.env.FACEPLUSPLUS_API_URL + '/compare';

    constructor() {
        if (!this.apiKey || !this.apiSecret || !this.apiUrl) {
            console.warn("WARNING: Face++ API credentials are not set in .env!");
        }
    }

    async verifyUser(avatarUrl: string, imageBuffer: Buffer): Promise<VerificationResult> {
        if (!this.apiKey || !this.apiSecret) {
            throw new InternalServerErrorException("Server configuration error: Face++ credentials missing.");
        }

        const formData = new FormData();
        formData.append('api_key', this.apiKey);
        formData.append('api_secret', this.apiSecret);
        formData.append('image_url1', avatarUrl);
        formData.append('image_file2', imageBuffer, { filename: 'checkin.jpg', contentType: 'image/jpeg' });

        try {
            const response = await axios.post(this.apiUrl, formData, {
                headers: {
                    ...formData.getHeaders(),
                },
                timeout: 10000, // 10s timeout
            });

            const data = response.data;

            // Face++ returns 'confidence' (0-100)
            const confidence = data.confidence;

            // Threshold Rule: > 80 is a match
            // Note: Face++ documentation suggests thresholds (e.g., 1e-3: 62.327, 1e-4: 71.8, 1e-5: 80). 
            // 80 is a very high threshold (safe).
            const isMatch = confidence >= 80;

            return { isMatch, confidence };

        } catch (error: any) {
            console.error("Face++ API Error:", error.response?.data || error.message);

            // Handle specific Face++ errors if needed
            if (error.response?.data?.error_message) {
                const msg = error.response.data.error_message;
                if (msg.includes('IMAGE_ERROR_FAILED_DOWNLOAD')) {
                    throw new BadRequestException("Không thể tải ảnh đại diện của bạn. Vui lòng kiểm tra lại avatar.");
                }
                if (msg.includes('IMAGE_ERROR_UNSUPPORTED_FORMAT')) {
                    throw new BadRequestException("Định dạng ảnh không được hỗ trợ.");
                }
                // Generic error
                throw new BadRequestException(`Lỗi xác thực khuôn mặt: ${msg}`);
            }

            throw new InternalServerErrorException("Lỗi kết nối đến dịch vụ nhận diện khuôn mặt.");
        }
    }
}
