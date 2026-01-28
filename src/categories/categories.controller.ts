import { Controller, Get, Post, Body } from '@nestjs/common';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) { }

  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }

  @Post('quick-create')
  quickCreate(@Body() body: { name: string; parent_id?: number }) {
    return this.categoriesService.quickCreate(body.name, body.parent_id);
  }
}
