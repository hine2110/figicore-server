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

  // NEW: Final Payment for Pre-order Contract
  @Post('contracts/:id/final-payment')
  @UseGuards(AuthGuard('jwt'))
  createFinalPayment(@Req() req, @Param('id') id: string, @Body() body: { shipping_address_id: number, payment_method_code: string }) {
    return this.ordersService.createFinalPaymentOrder(req.user.user_id, +id, body);
  }

  @Post('contracts/:id/mock-final-pay')
  @UseGuards(AuthGuard('jwt'))
  async mockFinalPay(@Req() req, @Param('id') id: string) {
    // 1. Get Contract to find original shipping address
    const contract = await this.ordersService.getContractDetails(+id, req.user.user_id);

    // 2. Reuse the address from the deposit order automatically
    const addressId = contract.deposit_order?.shipping_address_id;

    if (!addressId) {
      throw new Error("Original deposit order has no shipping address");
    }

    // 3. Call the existing final payment logic (BUT bypass payment status checks if needed)
    // This reuses your existing logic but simulates a successful payment immediately
    return this.ordersService.createFinalPaymentOrder(req.user.user_id, +id, {
      shipping_address_id: addressId,
      payment_method_code: 'COD' // Default to COD for mock
    });
  }



  @Get('contracts/my-contracts') // Matches the route Frontend is calling
  @UseGuards(AuthGuard('jwt'))
  findMyContracts(@Req() req) {
    return this.ordersService.findMyContracts(req.user.user_id);
  }

  @Get('contracts/:id')
  @UseGuards(AuthGuard('jwt'))
  getContract(@Req() req, @Param('id') id: string) {
    return this.ordersService.getContractDetails(+id, req.user.user_id);
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

  @Post('mock-pay-group')
  @UseGuards(AuthGuard('jwt'))
  mockPayGroup(@Req() req, @Body() body: { payment_ref_code: string }) {
    return this.ordersService.mockPayGroup(body.payment_ref_code, req.user.user_id);
  }

  @Get('by-ref/:ref')
  @UseGuards(AuthGuard('jwt'))
  getOrdersByRef(@Req() req, @Param('ref') ref: string) {
    return this.ordersService.getOrdersByRef(ref, req.user.user_id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ordersService.remove(+id);
  }
}
