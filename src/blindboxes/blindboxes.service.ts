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

        const rawConfig = typeof config.tier_config === 'string' ? JSON.parse(config.tier_config) : config.tier_config;
        const getRange = (name: string) => {
            if (Array.isArray(rawConfig)) return rawConfig.find((t: any) => t.name === name);
            return rawConfig[name] ? { ...rawConfig[name], name } : null;
        };

        for (let i = 0; i < quantity; i++) {
            let winner: any = null;
            let attempts = 0;

            while (!winner && attempts < 5) {
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
                        products: { type_code: 'RETAIL' } // Strict Retail Filter
                    },
                    // FIX: Prioritize Defect items in the random pool check
                    orderBy: { stock_defect: 'desc' },
                    take: 20
                });

                if (candidates.length > 0) {
                    winner = candidates[Math.floor(Math.random() * candidates.length)];
                }
            }

            if (!winner) throw new BadRequestException("OOS: Cannot find valid Blindbox item!");

            // 2. SMART DEDUCTION LOGIC (Defect First)
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

            if (!deducted) {
                throw new BadRequestException("Item out of stock during transaction.");
            }

            excludeIds.add(winner.variant_id);
            results.push(winner);
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
