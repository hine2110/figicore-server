import { Controller, Get, Post, Body, Patch, Param, Delete, Req, UseGuards, Query } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { AuthGuard } from '@nestjs/passport';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) { }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(@Req() req, @Body() createOrderDto: CreateOrderDto) {
    console.log('[OrdersController] Create Order Request:', {
      userId: req.user.user_id,
      dto: createOrderDto
    });
    try {
      return this.ordersService.create(req.user.user_id, createOrderDto);
    } catch (e) {
      console.error('[OrdersController] Create Order Error:', e);
      throw e;
    }
  }

  @Post(':id/confirm-payment')
  @UseGuards(AuthGuard('jwt'))
  confirmPayment(@Req() req, @Param('id') id: string) {
    console.log(`[OrdersController] Confirm Payment Request for Order #${id}`);
    return this.ordersService.confirmPayment(+id, req.user.user_id);
  }

  @Post(':id/expire')
  @UseGuards(AuthGuard('jwt'))
  expireOrder(@Req() req, @Param('id') id: string) {
    console.log(`[OrdersController] Expire Order Request for Order #${id}`);
    return this.ordersService.expireOrder(+id, req.user.user_id);
  }

  @Post(':id/cancel')
  @UseGuards(AuthGuard('jwt'))
  cancelOrder(@Req() req, @Param('id') id: string) {
    return this.ordersService.cancelOrder(+id, req.user.user_id);
  }

  @Get()
  findAll(@Query() query: { status?: string }) {
    return this.ordersService.findAll(query);
  }

  @Get('my-orders')
  @UseGuards(AuthGuard('jwt'))
  findMyOrders(@Req() req) {
    return this.ordersService.findAllByUser(req.user.user_id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateOrderDto: UpdateOrderDto) {
    return this.ordersService.update(+id, updateOrderDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ordersService.remove(+id);
  }
}
