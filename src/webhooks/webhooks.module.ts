import { Module } from '@nestjs/common';
import { GHNWebhookController } from './ghn-webhook.controller';
import { OrdersModule } from '../orders/orders.module';

@Module({
    imports: [OrdersModule],
    controllers: [GHNWebhookController],
})
export class WebhooksModule { }
