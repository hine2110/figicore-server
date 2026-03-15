import { Controller, Get, Post, Patch, Param, Body, UseGuards, NotFoundException, BadRequestException, Logger, Query } from '@nestjs/common';
import { AiAssistantService } from './ai-assistant.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductPromotionsService } from '../product-promotions/product-promotions.service';
import dayjs from 'dayjs';

// Optionally add AuthGuard/RolesGuard here for Admin
@Controller('ai-assistant')
export class AiAssistantController {
  private readonly logger = new Logger(AiAssistantController.name);

  constructor(
    private readonly aiAssistantService: AiAssistantService,
    private readonly prisma: PrismaService,
    private readonly productPromotionsService: ProductPromotionsService,
  ) {}

  @Get('recommendations')
  async getRecommendations(@Query('productId') productId?: string) {
    const whereClause: any = {
      status_code: 'PENDING',
    };

    if (productId) {
      const pid = parseInt(productId, 10);
      if (!isNaN(pid)) {
        // Find all variant IDs belonging to this product
        const variants = await this.prisma.product_variants.findMany({
          where: { product_id: pid },
          select: { variant_id: true }
        });
        
        whereClause.target_type = 'VARIANT';
        whereClause.target_id = {
            in: variants.map(v => v.variant_id)
        };
      }
    }

    return this.prisma.system_recommendations.findMany({
      where: whereClause,
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  @Post('trigger')
  async triggerAnalysis() {
    this.logger.log('Manually triggering AI Assistant analysis...');
    // We don't await this so the request doesn't timeout if Gemini is slow
    this.aiAssistantService.analyzeInventoryHealth()
      .then(() => this.logger.log('Manual AI analysis completed.'))
      .catch(err => this.logger.error('Manual AI analysis failed', err));
      
    return { message: 'AI Analysis has been triggered in the background.' };
  }


  @Post('recommendations/:id/apply')
  async applyRecommendation(
    @Param('id') id: string,
    @Body() body: { overwrite?: boolean } = {}
  ) {
    const recId = parseInt(id, 10);
    const recommendation = await this.prisma.system_recommendations.findUnique({
      where: { recommendation_id: recId }
    });

    if (!recommendation) throw new NotFoundException('Recommendation not found');
    if (recommendation.status_code !== 'PENDING') throw new BadRequestException('Recommendation is already processed');

    const action = recommendation.suggested_action as any;
    
    try {
        if (recommendation.type === 'DISCOUNT' && recommendation.target_type === 'VARIANT') {
            const variant = await this.prisma.product_variants.findUnique({
                where: { variant_id: recommendation.target_id },
                include: { product_promotions: true }
            });
            if (!variant) throw new NotFoundException('Target variant not found');

            // --- CONFLICT DETECTION ---
            if (variant.product_promotions && variant.product_promotions.is_active && !body.overwrite) {
                return {
                    conflict: true,
                    message: `Conflict detected: Product already has an active promotion: "${variant.product_promotions.name}"`,
                    existingPromotion: {
                        id: variant.product_promotions.promotion_id,
                        name: variant.product_promotions.name,
                        value: variant.product_promotions.value
                    }
                };
            }

            // If overwrite is true, deactivate existing promotion first if it exists
            if (body.overwrite && variant.product_promotions && variant.product_promotions.is_active) {
                await this.prisma.product_promotions.update({
                    where: { promotion_id: variant.product_promotions.promotion_id },
                    data: { is_active: false }
                });
                this.logger.log(`Deactivated conflicting promotion ${variant.product_promotions.promotion_id} for Variant ${variant.variant_id}`);
            }

            const durationHours = action.duration_days ? Math.min(action.duration_days * 4, 12) : 4; 
            const nowHour = dayjs().hour();
            const nowMin = dayjs().minute();
            const endHour = Math.min(nowHour + durationHours, 23);

            const startTime = `${String(nowHour).padStart(2, '0')}:${String(nowMin).padStart(2, '0')}`;
            const endTime = `${String(endHour).padStart(2, '0')}:${String(nowMin).padStart(2, '0')}`;

            const promo = await this.productPromotionsService.create({
                name: `AI Strategic: ${recommendation.title}`,
                type_code: 'PERCENTAGE',
                value: action.discount_percent || 10,
                start_time: startTime,
                end_time: endTime,
                is_active: true,
                is_recurring: false,
            });

            // Target specifically this VARIANT, not the whole product
            await this.productPromotionsService.applyToVariants(promo.promotion_id, [variant.variant_id]);
            this.logger.log(`Created Promotion ${promo.promotion_id} specifically for Variant ${variant.variant_id}`);
        } else if (recommendation.type === 'RESTOCK' && recommendation.target_type === 'VARIANT') {
            const variant = await this.prisma.product_variants.findUnique({
                where: { variant_id: recommendation.target_id }
            });
            if (!variant) throw new NotFoundException('Target variant not found');

            const restockAmount = action.restock_amount || 50;
            this.logger.log(`AI applied RESTOCK action: Notified purchasing department to order ${restockAmount} units of Variant ${variant.variant_id} (${variant.sku}).`);
            // Here you would integrate with an Ordering / Purchase Order module.
        } else {
            this.logger.warn(`Action type ${recommendation.type} is not fully automated yet.`);
        }

        const updated = await this.prisma.system_recommendations.update({
          where: { recommendation_id: recId },
          data: { status_code: 'APPLIED', updated_at: new Date() }
        });

        return { message: 'Recommendation applied successfully', data: updated };
    } catch (error: any) {
        this.logger.error('Failed to apply recommendation', error);
        throw new BadRequestException('Failed to apply recommendation: ' + error.message);
    }
  }

  @Patch('recommendations/:id/dismiss')
  async dismissRecommendation(@Param('id') id: string) {
    const recId = parseInt(id, 10);
    const updated = await this.prisma.system_recommendations.update({
      where: { recommendation_id: recId },
      data: { status_code: 'DISMISSED', updated_at: new Date() }
    });

    return { message: 'Recommendation dismissed', data: updated };
  }
}


