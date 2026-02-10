import { Controller, Post, Get, Body, Query, UseGuards, Request, Param, UsePipes, ValidationPipe } from '@nestjs/common';
import { PosOrdersService } from './pos-orders.service';
import { CreatePosOrderDto } from './dto/create-pos-order.dto';
import { SearchCustomerDto } from './dto/search-customer.dto';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PosService } from './pos.service';

@Controller('pos/orders')
@UseGuards(JwtAuthGuard)
export class PosOrdersController {
    constructor(
        private readonly posOrdersService: PosOrdersService,
        private readonly posService: PosService,
    ) { }

    /**
     * Lấy analytics của session hiện tại
     * GET /pos/orders/analytics
     */
    @Get('analytics')
    async getSessionAnalytics(@Request() req) {
        const staffId = req.user.userId;
        return this.posService.getSessionAnalytics(staffId);
    }

    /**
     * Tìm kiếm khách hàng
     * GET /pos/orders/search-customer
     */
    @Get('search-customer')
    async searchCustomer(@Query() query: SearchCustomerDto) {
        return this.posOrdersService.searchCustomer(query);
    }

    /**
     * Lấy danh sách đơn hàng của session hiện tại
     * GET /pos/orders
     */
    @Get()
    async getOrders(@Request() req) {
        const staffId = req.user.userId;
        return this.posOrdersService.getOrdersByStaff(staffId);
    }

    /**
     * Tạo đơn hàng POS
     * POST /pos/orders
     */
    @Post()
    @UsePipes(new ValidationPipe({ transform: true }))
    async createOrder(@Request() req, @Body() dto: CreatePosOrderDto) {
        console.log(`[DEBUG_CONTROLLER] createOrder Payload. UserID: ${dto.user_id}, Type: ${typeof dto.user_id}`);
        const staffId = req.user.userId;
        return this.posOrdersService.createOrder(staffId, dto);
    }

    /**
     * Lấy lịch sử mua hàng của khách hàng
     * GET /pos/orders/customer/:userId
     */
    @Get('customer/:userId')
    async getCustomerOrderHistory(
        @Param('userId') userId: string,
        @Request() req
    ) {
        const staffId = req.user.userId;
        return this.posOrdersService.getCustomerOrderHistory(parseInt(userId), staffId);
    }

    /**
     * Đăng ký khách hàng nhanh
     * POST /pos/orders/register-customer
     */
    @Post('register-customer')
    async registerCustomer(@Body() dto: RegisterCustomerDto) {
        return this.posOrdersService.registerCustomer(dto);
    }
}
