import { Module } from '@nestjs/common';
import { ScannerGateway } from './scanner.gateway';

@Module({
  providers: [ScannerGateway],
})
export class ScannerModule {}
