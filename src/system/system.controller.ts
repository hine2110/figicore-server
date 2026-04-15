import { Controller, Get, Patch, Body, UseGuards, Request, Post, Delete, Param, ParseIntPipe } from '@nestjs/common';
import { SystemService } from './system.service';
import { UpdateOpexDto } from './dto/update-opex.dto';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';

@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('opex')
  @UseGuards(JwtAuthGuard)
  async getOpexConfig() {
    const result = await this.systemService.getOpexConfig();
    return { success: true, data: result };
  }

  @Patch('opex')
  @UseGuards(JwtAuthGuard)
  async updateOpexConfig(
    @Body() dto: UpdateOpexDto,
    @Request() req: any,
  ) {
    const userId = req.user.userId;
    const result = await this.systemService.updateOpexConfig(dto, userId);
    return { success: true, data: result };
  }

  // --- BANNERS ---

  @Public()
  @Get('banners')
  async getActiveBanners() {
    const result = await this.systemService.getBanners(true);
    return { success: true, data: result };
  }

  @Get('banners/admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'MANAGER')
  async getAllBanners() {
    const result = await this.systemService.getBanners(false);
    return { success: true, data: result };
  }

  @Post('banners')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'MANAGER')
  async createBanner(@Body() dto: CreateBannerDto) {
    const result = await this.systemService.createBanner(dto);
    return { success: true, data: result };
  }

  @Patch('banners/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'MANAGER')
  async updateBanner(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBannerDto,
  ) {
    const result = await this.systemService.updateBanner(id, dto);
    return { success: true, data: result };
  }

  @Delete('banners/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'MANAGER')
  async deleteBanner(@Param('id', ParseIntPipe) id: number) {
    await this.systemService.deleteBanner(id);
    return { success: true, message: 'Deleted successfully' };
  }

  @Patch('banners/:id/toggle')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'MANAGER')
  async toggleBanner(@Param('id', ParseIntPipe) id: number) {
    const result = await this.systemService.toggleBannerStatus(id);
    return { success: true, data: result };
  }
}
