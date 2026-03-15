import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import dayjs from 'dayjs';
import Groq from 'groq-sdk';

@Injectable()
export class AiAssistantService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AiAssistantService.name);
  private groq: Groq | null = null;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('GROQ_API_KEY');
    
    if (apiKey) {
      this.groq = new Groq({ apiKey });
    } else {
      this.logger.warn('GROQ_API_KEY is not set. AI features might not work.');
    }
  }

  async onApplicationBootstrap() {
    this.logger.log('Application started. Running initial AI inventory analysis in the background...');
    this.analyzeInventoryHealth().catch(err => {
      this.logger.error('Failed to run initial AI analysis', err);
    });
  }

  async analyzeInventoryHealth() {
    if (!this.groq) {
      this.logger.error('Groq AI is not initialized.');
      return;
    }

    try {
      this.logger.log('Starting Advanced Inventory Health Analysis...');
      
      const thirtyDaysAgo = dayjs().subtract(30, 'days').toDate();
      const sevenDaysAgo = dayjs().subtract(7, 'days').toDate();

      // Get potential candidates (High stock or Low stock)
      const candidates = await this.prisma.product_variants.findMany({
        where: {
          OR: [
            { stock_available: { gt: 15 } }, // Potential overstock
            { stock_available: { lte: 10, gt: 0 } } // Potential stockout
          ]
        },
        include: {
          products: { select: { name: true } },
          order_items: {
            where: {
              orders: {
                status_code: 'COMPLETED',
                created_at: { gte: thirtyDaysAgo }
              }
            },
            select: {
              quantity: true,
              orders: { select: { created_at: true } }
            }
          }
        },
        take: 30
      });

      if (candidates.length === 0) {
        this.logger.log('No inventory candidates found for analysis.');
        return;
      }

      // Calculate Metrics for each candidate
      const enrichedData = candidates.map(c => {
        const sales30 = c.order_items.reduce((sum, item) => sum + item.quantity, 0);
        const sales7 = c.order_items
          .filter(item => dayjs(item.orders.created_at).isAfter(sevenDaysAgo))
          .reduce((sum, item) => sum + item.quantity, 0);

        const ads30 = parseFloat((sales30 / 30).toFixed(2));
        const ads7 = parseFloat((sales7 / 7).toFixed(2));
        const momentum = ads30 > 0 ? parseFloat((ads7 / ads30).toFixed(2)) : (ads7 > 0 ? 2 : 1);
        const doh = ads30 > 0 ? Math.round(c.stock_available / ads30) : (c.stock_available > 0 ? 999 : 0);

        return {
          variant_id: c.variant_id,
          product_name: c.products?.name || 'Unknown',
          variant_name: c.option_name || 'Default',
          sku: c.sku,
          price: Number(c.price),
          stock: c.stock_available,
          metrics: {
            ads_30d: ads30,
            ads_7d: ads7,
            momentum: momentum,
            days_of_health: doh
          }
        };
      });

      this.logger.log(`Analyzing ${enrichedData.length} enriched candidates with Groq...`);

      const recommendations = await this.askGroqForStrategicAdvice(enrichedData);
      
      if (recommendations && recommendations.length > 0) {
        // Map metrics back to recommendations for UI display
        const finalizedRecs = recommendations.map(rec => {
            const original = enrichedData.find(d => d.variant_id === rec.target_id);
            return {
                ...rec,
                suggested_action: {
                    ...rec.suggested_action,
                    original_metrics: original ? original.metrics : null,
                    product_name: original ? original.product_name : 'Unknown',
                    variant_name: original ? original.variant_name : 'N/A',
                    sku: original ? original.sku : 'N/A'
                }
            };
        });
        await this.saveRecommendations(finalizedRecs);
        this.logger.log(`Saved ${finalizedRecs.length} professional AI recommendations.`);
      }

    } catch (error) {
      this.logger.error('Error during inventory health analysis:', error);
      throw error;
    }
  }

  private async askGroqForStrategicAdvice(items: any[]): Promise<any[]> {
    try {
        if (!this.groq) throw new Error("Groq client not initialized");

        const prompt = `
        You are a Senior Inventory Strategist for FigiCore. Use the ABC/XYZ Matrix approach to provide actionable recommendations.

Metrics definitions:
- ads_30d: Average daily sales over 30 days.
- momentum: (ADS 7d / ADS 30d). >1.1 means "Heating Up", <0.9 means "Cooling Down".
- days_of_health (DOH): Estimated days until stock hits zero based on ADS 30d.

Strategic Rules:
1. RESTOCK: If DOH < 7 and ads_30d > 0.5. Reasoning should emphasize lost revenue risk.
2. DISCOUNT: If DOH > 45 or (stock > 20 and ads_30d < 0.1). Reasoning should focus on clearing capital.
3. MONITOR: If metrics are stable. (Only return recommendations for RESTOCK or DISCOUNT).

CRITICAL: Include the variant_name in the "title" so the user knows exactly which option this applies to.
Example Title: "Clearance: [Product Name] - [Variant Name]" or "Restock: [Variant Name]"

Return a JSON array of objects:
{
  "target_id": integer,
  "target_type": "VARIANT",
  "type": "RESTOCK" | "DISCOUNT",
  "title": "Action-oriented title",
  "reasoning": "Professional business justification mentioning velocity/momentum",
  "expected_outcome": "Briefly describe the expected improvement (e.g., 'Likely to clear 15 units in 10 days', 'Prevent 12% revenue loss')",
  "suggested_action": {
    "discount_percent": integer (optional),
    "restock_amount": integer (optional)
  }
}

Data: ${JSON.stringify(items)}
    `;

    const chatCompletion = await this.groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are a Senior Inventory Strategist. Always reply with valid JSON array of objects.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
    });

    const textResponse = chatCompletion.choices[0]?.message?.content || '[]';
    
    // Groq's json_object format might return a wrapper object like { "recommendations": [...] } 
    // or just the array if we prompted correctly. Let's make it robust.
    const parsed = JSON.parse(textResponse);
    
    if (Array.isArray(parsed)) return parsed;
    if (parsed.recommendations && Array.isArray(parsed.recommendations)) return parsed.recommendations;
    if (parsed.data && Array.isArray(parsed.data)) return parsed.data;
    
    return [];
    
  } catch (error: any) {
    this.logger.error('Failed to parse strategic output from Groq or API Error:', error);
    return [];
  }
}

  private async saveRecommendations(recommendations: any[]) {
      for (const rec of recommendations) {
          try {
              // Ensure we don't spam the same recommendation if it's already PENDING
              const existing = await this.prisma.system_recommendations.findFirst({
                  where: {
                      target_id: rec.target_id,
                      target_type: rec.target_type,
                      status_code: 'PENDING'
                  }
              });

              if (existing) {
                  // Update existing pending one with new data/insight
                  await this.prisma.system_recommendations.update({
                      where: { recommendation_id: existing.recommendation_id },
                      data: {
                          title: rec.title,
                          reasoning: rec.reasoning,
                          suggested_action: {
                              ...(rec.suggested_action || {}),
                              expected_outcome: rec.expected_outcome
                          },
                          updated_at: new Date()
                      }
                  });
              } else {
                  await this.prisma.system_recommendations.create({
                      data: {
                          target_type: rec.target_type || 'VARIANT',
                          target_id: rec.target_id,
                          type: rec.type,
                          title: rec.title,
                          reasoning: rec.reasoning,
                          suggested_action: {
                              ...(rec.suggested_action || {}),
                              expected_outcome: rec.expected_outcome
                          },
                          status_code: 'PENDING'
                      }
                  });
              }
          } catch (e) {
              this.logger.warn(`Failed to save recommendation for target_id ${rec.target_id}`);
          }
      }
  }
}
