import { Injectable, OnModuleInit, BadRequestException } from '@nestjs/common';
// @ts-ignore - 'canvas' types might conflict slightly with DOM types in face-api
import { Canvas, Image, ImageData, loadImage } from 'canvas';
import * as path from 'path';
// 1. Import bản pure JavaScript của TensorFlow để tránh lỗi C++ trên Windows
import * as tf from '@tensorflow/tfjs'; 

@Injectable()
export class FaceValidationService implements OnModuleInit {
  private isModelLoaded = false;
  private faceapi: any = null;
  private nsfwModel: any = null;
  private mobilenetModel: any = null;

  async onModuleInit() {
    try {
      // 1. Khởi tạo engine TensorFlow thuần JavaScript (CPU Backend)
      await tf.ready();
      console.log(`[FaceValidationService] ✅ TensorFlow.js (Pure JS) initialized.`);

      // 🚀 BƯỚC HACK: Can thiệp vào cơ chế Module Resolution của Node.js
      const Module = require('module');
      const originalRequire = Module.prototype.require;
      
      Module.prototype.require = function (id: string) {
        // Khi face-api đòi load bản C++ (tfjs-node), ta tráo bằng bản JS (tfjs)
        if (id === '@tensorflow/tfjs-node') {
          return originalRequire.call(this, '@tensorflow/tfjs');
        }
        return originalRequire.call(this, id);
      };

      // 2. Khởi tạo Face-API bằng require (kích hoạt bẫy đã giăng ở trên)
      const faceApiModule = require('@vladmandic/face-api');
      this.faceapi = faceApiModule.default || faceApiModule;
      this.faceapi.env.monkeyPatch({ Canvas, Image, ImageData } as any);

      // 3. CLEANUP: Khôi phục require về nguyên bản ngay lập tức
      // (Best Practice để tránh Side-effect làm hỏng các module khác của NestJS)
      Module.prototype.require = originalRequire;

      const modelsPath = path.join(process.cwd(), 'public', 'models');
      await this.faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsPath);
      console.log(`[FaceValidationService] ✅ Face-API Module loaded from: ${modelsPath}`);
      
      // 4. Load NSFWJS (Layer 1)
      try {
        const nsfwjs = await import('nsfwjs');
        this.nsfwModel = await nsfwjs.load();
        console.log(`[FaceValidationService] ✅ NSFWJS Module loaded.`);
      } catch (nsfwErr: any) {
        console.warn('[FaceValidationService] ⚠️ NSFWJS could not load. Layer 1 bypassed.', nsfwErr?.message);
      }

      // 5. Load MobileNet (Layer 2)
      try {
        const mobilenetModule = await import('@tensorflow-models/mobilenet');
        this.mobilenetModel = await mobilenetModule.load({ version: 2, alpha: 1.0 });
        console.log(`[FaceValidationService] ✅ MobileNet Module loaded.`);
      } catch (mnErr: any) {
        console.warn('[FaceValidationService] ⚠️ MobileNet could not load. Layer 2 bypassed.', mnErr?.message);
      }

      this.isModelLoaded = true;
      console.log(`[FaceValidationService] 🚀 All AI Security Layers are READY!`);

    } catch (error: any) {
      console.error('[FaceValidationService] ❌ Core Face-API failed to load.', error?.message);
    }
  }

  async validateImageBuffer(buffer: Buffer): Promise<boolean> {
    if (!this.isModelLoaded || !this.faceapi) {
      console.warn('[FaceValidationService] ⚠️ Validation skipped (Core AI module down).');
      return true; 
    }

    try {
      const image = await loadImage(buffer);

      // Chuẩn bị Canvas dùng chung cho các model phân loại (NSFW & MobileNet)
      let canvas: any = null;
      if (this.nsfwModel || this.mobilenetModel) {
        canvas = new Canvas(image.width, image.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image as any, 0, 0, image.width, image.height);
      }

      // ----------------------------------------------------------------------
      // LAYER 1: The NSFWJS Anti-Drawing Filter (Chặn Anime/Tranh vẽ)
      // ----------------------------------------------------------------------
      if (this.nsfwModel && canvas) {
        // Chuyển canvas thành Tensor để bản Pure JS đọc được an toàn
        const imageTensor = tf.browser.fromPixels(canvas);
        const predictions = await this.nsfwModel.classify(imageTensor);
        imageTensor.dispose(); // Giải phóng RAM ngay lập tức

        const drawingProbability = predictions.find((p: any) => p.className === 'Drawing')?.probability || 0;
        const hentaiProbability = predictions.find((p: any) => p.className === 'Hentai')?.probability || 0;
        
        // Tăng độ khóa nhạy bén: Anime/Game splash arts thường nảy class Hentai nhẹ thay vì Drawing
        if (drawingProbability + hentaiProbability > 0.10) {
          throw new BadRequestException('Image rejected: Looks like a drawing or CGI. Please upload a real photo.');
        }
      }

      // ----------------------------------------------------------------------
      // LAYER 2: The MobileNet Anti-Entity Filter (Chặn Động vật/Đồ vật/CGI)
      // ----------------------------------------------------------------------
      if (this.mobilenetModel && canvas) {
        const imageTensor = tf.browser.fromPixels(canvas);
        const predictions = await this.mobilenetModel.classify(imageTensor, 3);
        imageTensor.dispose();

        // Mở rộng bộ lọc cho cả Puzzle, Menu, Bìa sách,... (Nhận diện tranh vẽ sặc sỡ trên ImageNet)
        const forbiddenTerms = [
          'macaque', 'monkey', 'chimpanzee', 'gorilla', 'ape', 'orangutan', 'baboon', 
          'mask', 'toys', 'comic book', 'action figure', 'toy',
          'jigsaw puzzle', 'book jacket', 'menu', 'web site', 'television', 'monitor'
        ];
        
        const isNonHuman = predictions.some((p: any) => {
          const classNameStr = p.className.toLowerCase();
          return forbiddenTerms.some(term => classNameStr.includes(term));
        });

        if (isNonHuman) {
          throw new BadRequestException('Image rejected: Non-human subject detected.');
        }
      }

      // ----------------------------------------------------------------------
      // LAYER 3: The Face-API Strict Portrait Filter (Chặn ảnh không rõ mặt)
      // ----------------------------------------------------------------------
      const detections = await this.faceapi.detectAllFaces(
        image as any, 
        new this.faceapi.SsdMobilenetv1Options({ minConfidence: 0.85 })
      );

      if (detections.length === 0) {
        throw new BadRequestException('No clear human face detected.');
      }

      if (detections.length > 1) {
        throw new BadRequestException('Multiple faces detected. Please upload a single portrait.');
      }

      const faceBox = detections[0].box;
      const faceArea = faceBox.width * faceBox.height;
      const imageArea = image.width * image.height;
      const facePercentage = faceArea / imageArea;

      if (facePercentage < 0.10) {
        throw new BadRequestException('Face is too far away. Please use a portrait photo.');
      }

      return true;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error; // Quăng nguyên mã 400 và message về cho Client
      }
      console.error('[FaceValidationService] ❌ Processing Error:', error.message);
      throw new BadRequestException('An error occurred during facial analysis using AI.');
    }
  }
}