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
}
