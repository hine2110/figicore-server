import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { AuctionsService } from './auctions.service';
import { CreateAuctionDto } from './dto/create-auction.dto';
import { UpdateAuctionDto } from './dto/update-auction.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('auctions')
export class AuctionsController {
  constructor(private readonly auctionsService: AuctionsService) { }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  create(@Body() createAuctionDto: CreateAuctionDto) {
    return this.auctionsService.create(createAuctionDto);
  }

  @Get()
  findAll() {
    // Both Admin and Customers need to see the active auctions
    return this.auctionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.auctionsService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  update(@Param('id') id: string, @Body() updateAuctionDto: UpdateAuctionDto) {
    return this.auctionsService.update(+id, updateAuctionDto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  remove(@Param('id') id: string) {
    return this.auctionsService.remove(+id);
  }

  @Post(':id/join')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('CUSTOMER')
  joinRoom(@Param('id') id: string, @Req() req: any) {
    return this.auctionsService.joinRoom(+id, req.user.user_id);
  }

  @Get(':id/my-status')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('CUSTOMER')
  getMyStatus(@Param('id') id: string, @Req() req: any) {
    return this.auctionsService.getMyStatus(+id, req.user.user_id);
  }

  @Patch(':id/force-end')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  forceEnd(@Param('id') id: string) {
    return this.auctionsService.forceEnd(+id);
  }

  @Post(':id/checkout')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('CUSTOMER')
  checkout(@Param('id') id: string, @Req() req: any, @Body() body: { shipping_fee?: number }) {
    return this.auctionsService.checkout(+id, req.user.user_id, body.shipping_fee || 0);
  }

  @Post(':id/decline')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('CUSTOMER')
  declineStandby(@Param('id') id: string, @Req() req: any) {
    return this.auctionsService.declineByStandby(+id, req.user.user_id);
  }

  @Post(':id/forfeit')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  forfeitWinner(@Param('id') id: string) {
    return this.auctionsService.forfeitWinner(+id);
  }

  @Delete(':id/participants/:userId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  kickParticipant(@Param('id') id: string, @Param('userId') userId: string) {
    return this.auctionsService.kickParticipant(+id, +userId);
  }

  @Post(':id/cancel')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  cancelResult(@Param('id') id: string) {
    return this.auctionsService.cancelResult(+id);
  }
}
