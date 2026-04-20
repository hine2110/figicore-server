import { Controller, Post, Get, Body, Query, UseGuards, Request, Param, UsePipes, ValidationPipe } from '@nestjs/common';
import { PosOrdersService } from './pos-orders.service';
import { CreatePosOrderDto } from './dto/create-pos-order.dto';
import { SearchCustomerDto } from './dto/search-customer.dto';
import { GetPosOrdersDto } from './dto/get-pos-orders.dto';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { SyncPosOrderDto } from './dto/sync-pos-order.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PosService } from './pos.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { StoreIpGuard } from '../common/guards/store-ip.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('pos/orders')
@UseGuards(JwtAuthGuard, RolesGuard, StoreIpGuard) 
@Roles('SUPER_ADMIN', 'MANAGER', 'STAFF_POS')
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
    @UsePipes(new ValidationPipe({ transform: true }))
    async getOrders(
        @Request() req,
        @Query() query: GetPosOrdersDto,
    ) {
        const staffId = req.user.userId;
        return this.posOrdersService.getOrdersByStaff(staffId, query);
    }

    /**
     * Tạo đơn hàng POS
     * POST /pos/orders
     */
    @Post()
    @UsePipes(new ValidationPipe({ transform: true }))
    async createOrder(@Request() req, @Body() dto: CreatePosOrderDto) {
        const staffId = req.user.userId;
        return this.posOrdersService.createOrder(staffId, dto);
    }

    /**
     * Lấy đơn hàng PENDING hiện tại (cho Sync)
     * GET /pos/orders/active
     */
    @Get('active')
    async getActiveOrder(@Request() req) {
        const staffId = req.user.userId;
        return this.posOrdersService.getActiveOrder(staffId);
    }

    /**
     * Đồng bộ giỏ hàng thời gian thực
     * POST /pos/orders/sync
     */
    @Post('sync')
    @UsePipes(new ValidationPipe({ transform: true }))
    async syncActiveOrder(@Request() req, @Body() dto: SyncPosOrderDto) {
        const staffId = req.user.userId;
        return this.posOrdersService.syncActiveOrder(staffId, dto);
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
     * Hủy đơn hàng POS
     * POST /pos/orders/:id/cancel
     */
    @Post(':id/cancel')
    async cancelOrder(@Param('id') id: string, @Request() req) {
        const staffId = req.user.userId;
        return this.posOrdersService.cancelOrder(staffId, parseInt(id));
    }

    /**
     * Đăng ký khách hàng nhanh
     * POST /pos/orders/register-customer
     */
    @Post('register-customer')
    async registerCustomer(@Body() dto: RegisterCustomerDto) {
        return this.posOrdersService.registerCustomer(dto);
    }

    /**
     * Lấy chi tiết đơn hàng
     * GET /pos/orders/:id
     */
    @Get(':id')
    async getOrderById(@Param('id') id: string, @Request() req) {
        const staffId = req.user.userId;
        return this.posOrdersService.getOrderById(staffId, parseInt(id));
    }

    /**
     * Tạo đơn hàng POS chờ QR (PENDING_PAYMENT)
     * POST /pos/orders/create-qr
     */
    @Post('create-qr')
    @UsePipes(new ValidationPipe({ transform: true }))
    async createQrOrder(@Request() req, @Body() dto: CreatePosOrderDto) {
        const staffId = req.user.userId;
        return this.posOrdersService.createPendingQrOrder(staffId, dto);
    }
}
