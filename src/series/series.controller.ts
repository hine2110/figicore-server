import { Controller, Get, Post, Body } from '@nestjs/common';
import { SeriesService } from './series.service';

@Controller('series')
export class SeriesController {
  constructor(private readonly seriesService: SeriesService) { }

  @Get()
  findAll() {
    return this.seriesService.findAll();
  }

  @Post('quick-create')
  quickCreate(@Body() body: { name: string }) {
    return this.seriesService.quickCreate(body.name);
  }
}
