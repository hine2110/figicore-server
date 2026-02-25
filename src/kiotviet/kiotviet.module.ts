import { Module } from '@nestjs/common';
import { KiotVietController } from './kiotviet.controller';
import { KiotVietService } from './kiotviet.service';

@Module({
  controllers: [KiotVietController],
  providers: [KiotVietService],
  exports: [KiotVietService]
})
export class KiotVietModule { }
