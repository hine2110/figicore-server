import { Injectable, OnModuleInit, BadRequestException } from '@nestjs/common';
// @ts-ignore - 'canvas' types might conflict slightly with DOM types in face-api
import { Canvas, Image, ImageData, loadImage } from 'canvas';
// Removed monkeyPatch and static import in global scope to catch errors safely inside
import * as path from 'path';

@Injectable()
export class FaceValidationService implements OnModuleInit {
  private isModelLoaded = false;
  private faceapi: any = null;

  async onModuleInit() {
    try {
      // 1. Use Dynamic Import to catch missing C++ (tfjs-node) library errors on Windows
      const module = await import('@vladmandic/face-api');
      this.faceapi = module.default || module;
      
      // 2. Monkey patch for NodeJS
      this.faceapi.env.monkeyPatch({ Canvas, Image, ImageData } as any);

      // 3. Load SsdMobilenetv1 models from the local public/models directory
      const modelsPath = path.join(process.cwd(), 'public', 'models');
      await this.faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsPath);
      
      this.isModelLoaded = true;
      console.log(`[FaceValidationService] ✅ AI Models loaded successfully from: ${modelsPath}`);
    } catch (error: any) {
      // Catch server crash and output Warning instead of throwing Error
      console.warn('[FaceValidationService] ⚠️ Missing C++ bindings in the current environment. Backend AI service is temporarily bypassed to Frontend. Detailed error:', error?.message);
    }
  }

  /**
   * Validates if a given image buffer contains at least one human face
   */
  async validateImageBuffer(buffer: Buffer): Promise<boolean> {
    // If AI fails to initialize, pass through to avoid blocking the application
    if (!this.isModelLoaded || !this.faceapi) {
      console.warn('[FaceValidationService] ⚠️ Validation skipped (AI module not loaded).');
      return true; 
    }

    try {
      const image = await loadImage(buffer);

      const detections = await this.faceapi.detectAllFaces(
        image as any, 
        new this.faceapi.SsdMobilenetv1Options()
      );

      if (detections.length === 0) {
        throw new BadRequestException('Invalid image. Please upload a photo containing a human face.');
      }

      return true;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error('[FaceValidationService] ❌ Processing Error:', error);
      throw new BadRequestException('An error occurred during facial analysis using AI.');
    }
  }
}
