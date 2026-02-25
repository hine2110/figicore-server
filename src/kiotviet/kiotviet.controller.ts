import { Controller, Get } from '@nestjs/common';
import { KiotVietService } from './kiotviet.service';

@Controller('kiotviet')
export class KiotVietController {
    constructor(private readonly kiotVietService: KiotVietService) { }

    @Get('sync-product-taxes')
    async syncProductTaxes() {
        try {
            return await this.kiotVietService.syncProductTaxes();
        } catch (error) {
            return {
                status: 'error',
                message: error.message,
                details: error.response?.data || 'Unknown error'
            };
        }
    }

    @Get('sync-products')
    async syncProducts() {
        try {
            return await this.kiotVietService.syncProducts();
        } catch (error) {
            return {
                status: 'error',
                message: error.message,
                details: error.response?.data || 'Unknown error'
            };
        }
    }

    @Get('bulk-push')
    async bulkPush() {
        try {
            return await this.kiotVietService.bulkPushToKiotViet();
        } catch (error) {
            return {
                status: 'error',
                message: error.message,
                details: error.response?.data || 'Unknown error'
            };
        }
    }
}
