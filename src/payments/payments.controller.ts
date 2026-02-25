import { Controller, Post, Body, Req, Headers } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
    constructor(private readonly paymentsService: PaymentsService) { }

    @Post('sepay-webhook')
    async handleSepayWebhook(
        @Body() body: any,
        @Headers('Authorization') authHeader: string,
    ) {
        // Basic verification - SePay webhook can be secured via API Key in headers or body structure
        // We will log and process the transaction here.
        return this.paymentsService.processWebhook(body);
    }
}
