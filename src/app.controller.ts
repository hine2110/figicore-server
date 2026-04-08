import { Controller, Get, Param } from '@nestjs/common';
import { AppService } from './app.service';
import { LivestreamsService } from './livestreams/livestreams.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly livestreamsService: LivestreamsService
  ) { }

  @Get('system/time')
  getSystemTime() {
    return {
      server_time: new Date().toISOString()
    };
  }

  @Get('api/ai-suggest/:variantId')
  suggestFlashSale(@Param('variantId') variantId: string) {
    return this.livestreamsService.suggestFlashPrice(+variantId);
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
