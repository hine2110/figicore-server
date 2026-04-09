import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { LivestreamsService } from './livestreams.service';
import { CreateLivestreamDto } from './dto/create-livestream.dto';
import { UpdateLivestreamDto } from './dto/update-livestream.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GiveawaysService } from './giveaways.service';

@Controller('livestreams')
export class LivestreamsController {
  constructor(
    private readonly livestreamsService: LivestreamsService,
    private readonly giveawaysService: GiveawaysService,
  ) {}

  @Get()
  findAll(@Query('status') status?: string) {
    return this.livestreamsService.findAll(status);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  create(@Body() createLivestreamDto: CreateLivestreamDto) {
    return this.livestreamsService.create(createLivestreamDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.livestreamsService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  update(@Param('id') id: string, @Body() updateLivestreamDto: UpdateLivestreamDto) {
    return this.livestreamsService.update(+id, updateLivestreamDto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  remove(@Param('id') id: string) {
    return this.livestreamsService.remove(+id);
  }

  @Post(':id/start')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  startSession(@Param('id') id: string) {
    return this.livestreamsService.startSession(+id);
  }

  @Post(':id/end')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  endSession(@Param('id') id: string) {
    return this.livestreamsService.endSession(+id);
  }

  @Post(':id/pin')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  pinProduct(@Param('id') id: string, @Body('productId') productId: number) {
    return this.livestreamsService.pinProduct(+id, productId);
  }

  @Post(':id/products')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  addProducts(@Param('id') id: string, @Body('variantIds') variantIds: number[]) {
    return this.livestreamsService.addProducts(+id, variantIds);
  }

  @Delete(':id/products/:variantId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  removeProduct(@Param('id') id: string, @Param('variantId') variantId: string) {
    return this.livestreamsService.removeProduct(+id, +variantId);
  }

  @Patch(':id/products/:variantId/restock')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  hotRestock(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body('amount') amount: number
  ) {
    return this.livestreamsService.hotRestock(+id, +variantId, amount);
  }

  @Get(':id/report')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  getReport(@Param('id') id: string) {
    return this.livestreamsService.getReport(+id);
  }

  @Get(':id/orders')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  getOrders(@Param('id') id: string) {
    return this.livestreamsService.getOrders(+id);
  }

  // --- GIVEAWAY MANAGEMENT ---

  @Post(':id/giveaways')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  createGiveaway(
    @Param('id') id: string,
    @Body() data: { variantId: number; keyword: string; slotsLimit: number }
  ) {
    return this.giveawaysService.createGiveaway(+id, data);
  }

  @Get(':id/giveaways')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  getGiveaways(@Param('id') id: string) {
    return this.giveawaysService.getGiveawaysByLive(+id);
  }
}
