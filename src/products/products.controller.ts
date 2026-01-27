import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

import { QuickCreateProductDto } from './dto/quick-create-product.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) { }

  @Post()
  create(@Body() createProductDto: CreateProductDto) {
    return this.productsService.create(createProductDto);
  }

  // ⚠️ IMPORTANT: Place this BEFORE any ':id' routes
  @Post('quick-create')
  quickCreate(@Body() body: QuickCreateProductDto) {
    return this.productsService.quickCreate(body);
  }

  @Get()
  findAll(
    @Query() query: { search?: string, brand_id?: string, category_id?: string, series_id?: string, type_code?: string }
  ) {
    return this.productsService.findAll({
      search: query.search,
      brand_id: query.brand_id ? Number(query.brand_id) : undefined,
      category_id: query.category_id ? Number(query.category_id) : undefined,
      series_id: query.series_id ? Number(query.series_id) : undefined,
      type_code: query.type_code
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productsService.update(+id, updateProductDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productsService.remove(+id);
  }

  @Patch(':id/toggle-status')
  toggleStatus(@Param('id') id: string) {
    return this.productsService.toggleStatus(+id);
  }
}
