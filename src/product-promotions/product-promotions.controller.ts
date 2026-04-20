import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Patch, UseGuards, Query } from '@nestjs/common';
import { ProductPromotionsService } from './product-promotions.service';
import { CreateProductPromotionDto } from './dto/create-product-promotion.dto';
import { UpdateProductPromotionDto } from './dto/update-product-promotion.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('product-promotions')
export class ProductPromotionsController {
  constructor(private readonly service: ProductPromotionsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER')
  create(@Body() dto: CreateProductPromotionDto) {
    return this.service.create(dto);
  }

  /** Public endpoint — no auth required — for the customer storefront */
  @Get('active-flash-sales')
  findActiveFlashSales() {
    return this.service.findActiveFlashSales();
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findAll({ page, limit, search, status });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductPromotionDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/apply')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER')
  apply(@Param('id', ParseIntPipe) id: number, @Body() body: { product_ids: number[] }) {
    return this.service.applyToProducts(id, body.product_ids);
  }

  @Post(':id/remove')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER')
  removeProducts(@Param('id', ParseIntPipe) id: number, @Body() body: { product_ids: number[] }) {
    return this.service.removeFromProducts(id, body.product_ids);
  }

  @Post(':id/apply-variants')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER')
  applyVariants(@Param('id', ParseIntPipe) id: number, @Body() body: { variant_ids: number[] }) {
    return this.service.applyToVariants(id, body.variant_ids);
  }

  @Patch(':id/resume')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER')
  resume(@Param('id', ParseIntPipe) id: number) {
    return this.service.resume(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Post(':id/preview-range')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER')
  previewByRange(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { minPrice: number, maxPrice: number }
  ) {
    return this.service.previewByPriceRange(id, body.minPrice, body.maxPrice);
  }

  @Post('preview-variants')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER')
  previewByVariants(
    @Body() body: { variantIds: number[], currentPromotionId?: number }
  ) {
    return this.service.previewByVariantIds(body.variantIds, body.currentPromotionId);
  }

  @Post(':id/apply-range')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER')
  applyByRange(
    @Param('id', ParseIntPipe) id: number, 
    @Body() body: { minPrice: number, maxPrice: number, overwrite?: boolean }
  ) {
    return this.service.applyToPriceRange(id, body.minPrice, body.maxPrice, body.overwrite ?? true);
  }
}
