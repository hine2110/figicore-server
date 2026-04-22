import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StoreIpGuard } from '../common/guards/store-ip.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) { }

  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }

  @Post('quick-create')
  @UseGuards(JwtAuthGuard, RolesGuard, StoreIpGuard)
  @Roles('SUPER_ADMIN', 'MANAGER', 'STAFF_INVENTORY')
  quickCreate(@Body() body: { name: string; parent_id?: number }) {
    return this.categoriesService.quickCreate(body.name, body.parent_id);
  }
}
