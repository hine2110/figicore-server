import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { BrandsService } from './brands.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StoreIpGuard } from '../common/guards/store-ip.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('brands')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) { }

  @Get()
  findAll() {
    return this.brandsService.findAll();
  }

  @Post('quick-create')
  @UseGuards(JwtAuthGuard, RolesGuard, StoreIpGuard)
  @Roles('SUPER_ADMIN', 'MANAGER', 'STAFF_INVENTORY')
  quickCreate(@Body() body: { name: string }) {
    return this.brandsService.quickCreate(body.name);
  }
}
