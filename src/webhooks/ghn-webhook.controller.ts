import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';

class GHNWebhookDto {
    OrderCode: string;
    Status: string;
    Time: string;
    TotalFee?: number;
    CODAmount?: number;
}

@Controller('webhook/ghn')
export class GHNWebhookController {
    constructor(private readonly ordersService: OrdersService) { }

    @Post()
    @HttpCode(HttpStatus.OK)
    async handleGHNWebhook(@Body() payload: GHNWebhookDto) {
        console.log('📦 GHN Webhook Received:', payload);

        const { OrderCode, Status, TotalFee } = payload;

        switch (Status) {
            case 'picking':
            case 'picked':
            case 'storing':
                await this.ordersService.updateStatusByTrackingCode(OrderCode, 'SHIPPING');
                break;

            case 'delivered':
                // Critical: Complete Order + Loyalty + Fee Sync
                await this.ordersService.completeOrder(OrderCode, TotalFee);
                break;

            case 'return':
            case 'returning': // Handling both variations just in case
                await this.ordersService.updateStatusByTrackingCode(OrderCode, 'RETURNING');
                break;

            case 'returned':
                await this.ordersService.updateStatusByTrackingCode(OrderCode, 'RETURNED');
                break;

            case 'cancel':
            case 'cancelled':
                await this.ordersService.updateStatusByTrackingCode(OrderCode, 'CANCELLED');
                break;

            default:
                console.log(`ℹ️ Unhandled GHN Status: ${Status}`);
        }

        return { RspCode: 0, Message: 'Success' };
    }

    @Post('simulate-return')
    @HttpCode(HttpStatus.OK)
    async simulateReturn(@Body() payload: { orderCode: string }) {
        console.log(`🚀 Simulating GHN Return Delivery for Order Code: ${payload.orderCode}`);

        // Find tracking code for the given orderCode
        // Assuming there's a findByOrderCode or similar. Let's look it up via Orders database if needed,
        // or we can add a new simulate returning helper in ordersService.
        // Actually, updateStatusByTrackingCode takes a trackingCode.
        // Let's add a quick Prisma lookup right here or inside OrdersService.
        // For simplicity, let's call a new simulate method inside OrdersService.
        await this.ordersService.simulateReturnByOrderCode(payload.orderCode);

        return { success: true, message: `Simulated GHN return delivery for ${payload.orderCode}` };
    }
}
