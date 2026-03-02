import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class KiotVietService {
    private readonly logger = new Logger(KiotVietService.name);
    private accessToken: string | null = null;
    private tokenExpiresAt: number = 0;

    constructor(
        private configService: ConfigService,
        private prisma: PrismaService,
    ) { }

    private async getAccessToken(): Promise<string> {
        const now = Date.now();
        if (this.accessToken && this.tokenExpiresAt > now) {
            return this.accessToken as string;
        }

        const clientId = this.configService.get<string>('KIOTVIET_CLIENT_ID');
        const clientSecret = this.configService.get<string>('KIOTVIET_CLIENT_SECRET');

        try {
            const response = await axios.post(
                'https://id.kiotviet.vn/connect/token',
                new URLSearchParams({
                    scopes: 'PublicApi.Access',
                    grant_type: 'client_credentials',
                    client_id: clientId || '',
                    client_secret: clientSecret || '',
                }),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                },
            );

            this.accessToken = response.data.access_token;
            this.tokenExpiresAt = now + response.data.expires_in * 1000 - 60000; // Buffer 1 min
            this.logger.log('KiotViet Access Token refreshed');
            return this.accessToken as string;
        } catch (error) {
            this.logger.error('Failed to get KiotViet Access Token', error.response?.data || error.message);
            throw error;
        }
    }

    async syncProductTaxes() {
        this.logger.log('Starting KiotViet Product Tax Sync...');
        const token = await this.getAccessToken();
        const retailer = this.configService.get<string>('KIOTVIET_RETAILER_CODE');

        try {
            // 1. Fetch Products from KiotViet
            // Note: KiotViet 'products' API returns a list. We need to check if it has tax info.
            // If not directly, we might need to check Categories or just rely on manual mapping if API fails.
            // But let's try to fetch a batch and see.

            let allProducts: any[] = [];
            let currentItem = 0;
            const pageSize = 100;
            let hasMore = true;

            while (hasMore) {
                const response = await axios.get('https://public.kiotapi.com/products', {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Retailer: retailer,
                    },
                    params: {
                        pageSize,
                        currentItem,
                        includeInventory: true,
                    },
                });

                const data = response.data.data;
                allProducts = [...allProducts, ...data];

                if (data.length < pageSize) {
                    hasMore = false;
                } else {
                    currentItem += data.length;
                }

                // Safety break for testing (remove in prod to sync all)
                if (allProducts.length > 500) hasMore = false;
            }

            this.logger.log(`Fetched ${allProducts.length} products from KiotViet.`);

            let updatedCount = 0;
            let errorsCount = 0;

            // 2. Update Database
            for (const kvProduct of allProducts) {
                try {
                    // Try to find matching variant by SKU (kvProduct.code)
                    // Note: KiotViet 'code' is usually our 'sku'.
                    // Use prisma to find and update.

                    // We assume KiotViet might have tax info in 'taxValue' or similar if configured. 
                    // For now, if missing, we just log it or set to 0. 
                    // Inspecting sample showed no explicit taxRate. 
                    // We will check if 'attributes' or other fields might have it later.

                    // Fallback: If 0, we might want to default to 10% (VAT) or leave as 0?
                    // User requested accurate tax. If missing from API, we can't invent it.
                    // We keep it 0 but log warning for sample.

                    const taxRate = kvProduct.taxValue || 0;

                    const updated = await this.prisma.product_variants.updateMany({
                        where: { sku: kvProduct.code },
                        data: { tax_rate: taxRate }
                    });

                    if (updated.count > 0) {
                        updatedCount += updated.count;
                    }
                } catch (err) {
                    errorsCount++;
                    // Continue loop
                }
            }

            this.logger.log(`Sync completed. Updated ${updatedCount} variants. Errors: ${errorsCount}`);
            return {
                status: 'success',
                totalFetched: allProducts.length,
                updatedLocal: updatedCount,
                errors: errorsCount,
                sample: allProducts.length > 0 ? allProducts[0] : null
            };

        } catch (error) {
            this.logger.error('Error syncing products', error.response?.data || error.message);
            throw error;
        }
    }

    async syncProducts() {
        this.logger.log('Starting KiotViet Product Sync...');
        const token = await this.getAccessToken();
        const retailer = this.configService.get<string>('KIOTVIET_RETAILER_CODE');

        try {
            let allProducts: any[] = [];
            let currentItem = 0;
            const pageSize = 100;
            let hasMore = true;

            while (hasMore) {
                const response = await axios.get('https://public.kiotapi.com/products', {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Retailer: retailer,
                    },
                    params: {
                        pageSize,
                        currentItem,
                        includeInventory: true,
                    },
                });

                const data = response.data.data;
                allProducts = [...allProducts, ...data];

                if (data.length < pageSize) {
                    hasMore = false;
                } else {
                    currentItem += data.length;
                }

                if (allProducts.length > 500) hasMore = false; // Safety limit
            }

            this.logger.log(`Fetched ${allProducts.length} products. Syncing to DB...`);

            let updatedCount = 0;

            // Ensure a default category exists
            let defaultCategory = await this.prisma.categories.findUnique({ where: { name: 'KiotViet Imported' } });
            if (!defaultCategory) {
                defaultCategory = await this.prisma.categories.create({
                    data: {
                        name: 'KiotViet Imported',
                        slug: 'kiotviet-imported',
                    }
                });
            }

            for (const kvProduct of allProducts) {
                try {
                    const sku = kvProduct.code;
                    const productName = kvProduct.name;
                    const basePrice = kvProduct.basePrice || 0;

                    // 1. Check if Variant exists by SKU
                    const existingVariant = await this.prisma.product_variants.findUnique({
                        where: { sku: sku }
                    });

                    let productId: number;

                    if (existingVariant) {
                        productId = existingVariant.product_id;
                        // Update Parent Product Name if needed (Optional, maybe don't overwrite user edits)
                        // await this.prisma.products.update({ where: { product_id: productId }, data: { name: productName } });
                    } else {
                        // Create New Parent Product
                        const newProduct = await this.prisma.products.create({
                            data: {
                                name: productName,
                                type_code: 'RETAIL',
                                status_code: 'ACTIVE',
                                category_id: defaultCategory.category_id,
                            }
                        });
                        productId = newProduct.product_id;
                    }

                    // 2. Upsert Variant
                    const stock = kvProduct.inventories ? kvProduct.inventories.reduce((sum: number, inv: any) => sum + inv.onHand, 0) : 0;

                    // Fallback tax logic: Check productTaxs array first (common in recent API), then taxValue
                    let taxRate = kvProduct.taxValue || 0;
                    if (kvProduct.productTaxs && kvProduct.productTaxs.length > 0) {
                        // Take the first tax value (usually VAT)
                        taxRate = kvProduct.productTaxs[0].value;
                    }

                    await this.prisma.product_variants.upsert({
                        where: { sku: sku },
                        update: {
                            price: basePrice,
                            stock_available: stock,
                            tax_rate: taxRate,
                            updated_at: new Date()
                        },
                        create: {
                            product_id: productId,
                            sku: sku,
                            option_name: 'Standard',
                            price: basePrice,
                            stock_available: stock,
                            tax_rate: taxRate,
                        }
                    });

                    updatedCount++;
                } catch (err) {
                    this.logger.error(`Failed to sync product ${kvProduct.code}`, err);
                }
            }

            return {
                status: 'success',
                totalSynced: updatedCount,
                message: `Synced ${updatedCount} products from KiotViet`
            };

        } catch (error) {
            this.logger.error('Error syncing products', error);
            throw error;
        }
    }

    /**
     * PUSH: Tạo sản phẩm lên KiotViet
     */
    async createProductOnKiotViet(data: {
        name: string,
        sku: string,
        price: number,
        categoryName: string,
        images?: string[],
        weight?: number
    }) {
        const token = await this.getAccessToken();
        const retailer = this.configService.get<string>('KIOTVIET_RETAILER_CODE');

        try {
            // 1. Prepare KiotViet Payload
            const payload = {
                Code: data.sku,
                Name: data.name,
                BasePrice: data.price,
                CategoryName: data.categoryName,
                Images: data.images || [],
                Weight: data.weight || 200,
                AllowsSale: true,
                Type: 1 // Hàng hóa thông thường
            };

            const response = await axios.post('https://public.kiotapi.com/products', payload, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Retailer: retailer,
                }
            });

            this.logger.log(`Created product on KiotViet: ${data.sku}`);
            return response.data;

        } catch (error) {
            // Nếu lỗi trùng mã sản phẩm (420 hoặc 400), mình coi như đã link thành công
            const resp = error.response?.data;
            const message = resp?.responseStatus?.message || resp?.Message || '';

            if ((error.response?.status === 420 || error.response?.status === 400) &&
                (message.includes('đã tồn tại') || message.includes('Mã hàng hóa đã tồn tại'))) {
                this.logger.warn(`Product SKU ${data.sku} already exists on KiotViet. Linking only.`);
                return { isLinked: true };
            }

            this.logger.error(`Failed to create product on KiotViet: ${data.sku}`, resp || error.message);
            throw error;
        }
    }

    /**
     * BULK PUSH: Đẩy toàn bộ sản phẩm bán lẻ từ FigiCore lên KiotViet
     */
    async bulkPushToKiotViet() {
        this.logger.log('Starting Bulk Push to KiotViet...');
        const products = await this.prisma.products.findMany({
            where: { type_code: 'RETAIL' },
            include: {
                categories: true,
                product_variants: true,
            }
        });

        this.logger.log(`Found ${products.length} retail products for bulk push.`);
        let successCount = 0;
        let failCount = 0;

        for (const product of products) {
            for (const variant of product.product_variants) {
                try {
                    // Chuẩn bị tên: "Tên sản phẩm (Tên variant)"
                    const pushName = variant.option_name && variant.option_name !== 'Standard'
                        ? `${product.name} (${variant.option_name})`
                        : product.name;

                    // Lấy ảnh từ media_urls (Json field của product) hoặc media_assets (Json field của variant)
                    let pushImages: string[] = [];
                    if (Array.isArray(product.media_urls)) {
                        pushImages = (product.media_urls as any[]).map(url => String(url));
                    } else if (Array.isArray(variant.media_assets)) {
                        pushImages = (variant.media_assets as any[]).map(asset => String(asset));
                    }

                    await this.createProductOnKiotViet({
                        name: pushName,
                        sku: variant.sku,
                        price: Number(variant.price),
                        categoryName: product.categories?.name || 'Test',
                        images: pushImages,
                        weight: variant.weight_g || 200
                    });
                    successCount++;
                } catch (error) {
                    this.logger.error(`Failed to push variant ${variant.sku}: ${error.message}`);
                    failCount++;
                }
            }
        }

        return {
            status: 'success',
            processed: successCount + failCount,
            succeeded: successCount,
            failed: failCount
        };
    }
}
