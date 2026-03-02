import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { AuthGuard } from '@nestjs/passport';

@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  // --- Customer APIs ---

  @Get('collectible')
  @UseGuards(AuthGuard('jwt'))
  getCollectibleVouchers(@Req() req) {
    return this.promotionsService.getCollectibleVouchers(req.user.user_id);
  }

  @Post(':id/collect')
  @UseGuards(AuthGuard('jwt'))
  collectVoucher(@Req() req, @Param('id') id: string) {
    return this.promotionsService.collectVoucher(req.user.user_id, +id);
  }

  @Get('my-vouchers')
  @UseGuards(AuthGuard('jwt'))
  getMyVouchers(@Req() req) {
    return this.promotionsService.getMyVouchers(req.user.user_id);
  }

  // --- Admin APIs ---

  @Post()
  create(@Body() createPromotionDto: CreatePromotionDto) {
    return this.promotionsService.create(createPromotionDto);
  }

  @Get()
  findAll() {
    return this.promotionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.promotionsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePromotionDto: UpdatePromotionDto) {
    return this.promotionsService.update(+id, updatePromotionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.promotionsService.remove(+id);
  }
}
