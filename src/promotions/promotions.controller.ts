import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, Query } from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { WeeklyVoucherCronService } from '../cron/weekly-voucher-cron.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { AuthGuard } from '@nestjs/passport';

@Controller('promotions')
export class PromotionsController {
  constructor(
    private readonly promotionsService: PromotionsService,
    private readonly weeklyVoucherCronService: WeeklyVoucherCronService,
  ) {}

  // --- Dev Tools ---
  
  @Post('dev/trigger-weekly-voucher')
  triggerWeeklyVouchers() {
    return this.weeklyVoucherCronService.triggerManually();
  }

  // --- Support ---

  @UseGuards(AuthGuard('jwt'))
  @Post('apology')
  sendApologyVoucher(@Body('email') email: string) {
    return this.promotionsService.createApologyVoucher(email);
  }

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
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('rank') rank?: string,
  ) {
    return this.promotionsService.findAll({ page, limit, search, type, status, rank });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.promotionsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePromotionDto: UpdatePromotionDto) {
    return this.promotionsService.update(+id, updatePromotionDto);
  }

  @Patch(':id/resume')
  resume(@Param('id') id: string) {
    return this.promotionsService.resume(+id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.promotionsService.remove(+id);
  }
}
