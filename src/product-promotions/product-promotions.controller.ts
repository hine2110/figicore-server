import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ProductPromotionsService } from './product-promotions.service';
import { CreateProductPromotionDto } from './dto/create-product-promotion.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('product-promotions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductPromotionsController {
  constructor(private readonly service: ProductPromotionsService) {}

  @Post()
  @Roles('MANAGER')
  create(@Body() dto: CreateProductPromotionDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles('MANAGER', 'ADMIN')
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @Roles('MANAGER', 'ADMIN')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post(':id/apply')
  @Roles('MANAGER')
  apply(@Param('id', ParseIntPipe) id: number, @Body() body: { product_ids: number[] }) {
    return this.service.applyToProducts(id, body.product_ids);
  }

  @Post(':id/remove')
  @Roles('MANAGER')
  removeProducts(@Param('id', ParseIntPipe) id: number, @Body() body: { product_ids: number[] }) {
    return this.service.removeFromProducts(id, body.product_ids);
  }

  @Delete(':id')
  @Roles('MANAGER')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Post(':id/apply-range')
  @Roles('MANAGER')
  applyByRange(
    @Param('id', ParseIntPipe) id: number, 
    @Body() body: { minPrice: number, maxPrice: number }
  ) {
    return this.service.applyToPriceRange(id, body.minPrice, body.maxPrice);
  }
}
