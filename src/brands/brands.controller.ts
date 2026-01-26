import { Controller, Get, Post, Body } from '@nestjs/common';
import { BrandsService } from './brands.service';

@Controller('brands')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) { }

  @Get()
  findAll() {
    return this.brandsService.findAll();
  }

  @Post('quick-create')
  quickCreate(@Body() body: { name: string }) {
    return this.brandsService.quickCreate(body.name);
  }
}
