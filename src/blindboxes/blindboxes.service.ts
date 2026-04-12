import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BlindboxesService {
    private readonly logger = new Logger(BlindboxesService.name);

    constructor(private prisma: PrismaService) { }

    private rollTier(tierConfig: any): string {
        const rand = Math.random() * 100;
        let cumulative = 0;
        const configArray = Array.isArray(tierConfig) ? tierConfig : Object.values(tierConfig);

        for (const tier of configArray as any[]) {
            cumulative += Number(tier.probability || tier);
            if (rand < cumulative) return tier.name || tier;
        }
        // Fallback to last tier
        return configArray[configArray.length - 1]?.name || 'COMMON';
    }

    async pickUniqueItems(tx: any, config: any, quantity: number): Promise<any[]> {
        const results: any[] = [];
        const excludeIds = new Set<number>();

        // DYNAMIC CONFIG GENERATION
        let rawConfig: any;

        // If min/max/price exist, generating dynamic tiers based on optimized 4-Zone Strategy
        // Zone 1 (35%): [min, ticket*0.9] - Shop Profits
        // Zone 2 (60%): [ticket*0.9, ticket*1.3] - Fair Zone (Around Ticket Price)
        // Zone 3 (4%): [ticket*1.3, max*0.9] - Big Win
        // Zone 4 (1%): [max*0.9, max] - Jackpot
        if (config.min_value && config.max_value && config.price) {
            const min = Number(config.min_value);
            const max = Number(config.max_value);
            const ticket = Number(config.price);

            // Calculate dynamic thresholds with safety guards
            let rawZ1 = ticket * 0.9;
            let rawZ2 = ticket * 1.3;
            let rawZ3 = max * 0.9;

            const splits = [rawZ1, rawZ2, rawZ3]
                .map(v => Math.max(min, Math.min(max, v)))
                .sort((a, b) => a - b);
                
            const b1 = Math.floor(splits[0]);
            const b2 = Math.floor(splits[1]);
            const b3 = Math.floor(splits[2]);

            rawConfig = [
                {
                    name: 'ZONE_1_SHOP_PROFIT',
                    probability: 55,
                    min: min,
                    max: b1
                },
                {
                    name: 'ZONE_2_FAIR',
                    probability: 40,
                    min: b1 + 1,
                    max: b2
                },
                {
                    name: 'ZONE_3_BIG_WIN',
                    probability: 4,
                    min: b2 + 1,
                    max: b3
                },
                {
                    name: 'ZONE_4_JACKPOT',
                    probability: 1,
                    min: b3 + 1,
                    max: max
                }
            ];
            // this.logger.log(`Dynamic 4-Zone Blindbox Config Generated for Product ${config.product_id}`);
        } else {
            rawConfig = typeof config.tier_config === 'string' ? JSON.parse(config.tier_config) : config.tier_config;
        }

        const getRange = (name: string) => {
            if (Array.isArray(rawConfig)) return rawConfig.find((t: any) => t.name === name);
            return rawConfig[name] ? { ...rawConfig[name], name } : null;
        };

        for (let i = 0; i < quantity; i++) {
            let allocated = false;
            let attempts = 0;

            while (!allocated && attempts < 10) {
                attempts++;
                const tierName = this.rollTier(rawConfig);
                const range = getRange(tierName);

                if (!range) continue;

                // 1. QUERY CANDIDATES (Retail Only + Range + Any Stock)
                const candidates = await tx.product_variants.findMany({
                    where: {
                        price: { gte: range.min || range.minPrice, lte: range.max || range.maxPrice },
                        // FIX: Allow picking if EITHER Good OR Defect stock exists
                        OR: [
                            { stock_available: { gt: 0 } },
                            { stock_defect: { gt: 0 } }
                        ],
                        variant_id: { notIn: Array.from(excludeIds) },
                        products: { type_code: 'RETAIL', status_code: 'ACTIVE' } // Strict Retail + Active Filter
                    },
                    // FIX: Prioritize Defect items in the random pool check
                    orderBy: { stock_defect: 'desc' },
                    take: 20
                });

                if (candidates.length === 0) continue;

                const winner = candidates[Math.floor(Math.random() * candidates.length)];

                // 2. SMART DEDUCTION LOGIC (Defect First) - NOW INSIDE RETRY LOOP
                let deducted = false;

                // Priority 1: Try to deduct Defect Stock
                const defectUpdate = await tx.product_variants.updateMany({
                    where: {
                        variant_id: winner.variant_id,
                        stock_defect: { gt: 0 }
                    },
                    data: { stock_defect: { decrement: 1 } }
                });

                if (defectUpdate.count > 0) {
                    deducted = true;
                    (winner as any)._source_stock = 'DEFECT';
                } else {
                    // Priority 2: Fallback to Good Stock
                    const normalUpdate = await tx.product_variants.updateMany({
                        where: {
                            variant_id: winner.variant_id,
                            stock_available: { gt: 0 }
                        },
                        data: { stock_available: { decrement: 1 } }
                    });
                    if (normalUpdate.count > 0) {
                        deducted = true;
                        (winner as any)._source_stock = 'AVAILABLE';
                    }
                }

                if (deducted) {
                    allocated = true;
                    excludeIds.add(winner.variant_id);
                    results.push(winner);
                    // this.logger.log(`Allocated box item: ${winner.sku} after ${attempts} attempts.`);
                } else {
                    this.logger.warn(`Collision detected: Item ${winner.sku} was taken by another customer. Retrying allocation... (Attempt ${attempts}/10)`);
                }
            }

            if (!allocated) {
                throw new BadRequestException("OOS: All candidate items in this Blindbox zone are currently out of stock or reserved.");
            }
        }
        return results;
    }

    async openBlindbox(userId: number, orderItemId: number) {
        // Just REVEAL the item now. Allocation happened at order creation.
        const orderItem = await this.prisma.order_items.findUnique({
            where: { item_id: orderItemId },
            include: { orders: true }
        });

        if (!orderItem) throw new BadRequestException("Order Item not found");
        if (orderItem.orders.user_id !== userId) throw new BadRequestException("Unauthorized");
        if ((orderItem as any).is_opened) throw new BadRequestException("Already opened");

        await this.prisma.order_items.update({
            where: { item_id: orderItemId },
            data: { is_opened: true } as any
        });

        return { success: true };
    }
}
