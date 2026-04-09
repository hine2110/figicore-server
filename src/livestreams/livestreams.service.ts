import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLivestreamDto } from './dto/create-livestream.dto';
import { UpdateLivestreamDto } from './dto/update-livestream.dto';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class LivestreamsService {
  private groq: OpenAI;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    const groqKey = this.configService.get<string>('GROQ_API_KEY');
    if (groqKey) {
      this.groq = new OpenAI({
        apiKey: groqKey,
        baseURL: 'https://api.groq.com/openai/v1',
      });
    }
  }

  async create(createLivestreamDto: CreateLivestreamDto) {
    const { product_ids, ...data } = createLivestreamDto;
    
    return this.prisma.livestreams.create({
      data: {
        ...data,
        start_time: data.start_time ? new Date(data.start_time) : null,
        products: product_ids ? {
          create: product_ids.map(id => ({
            variant_id: id
          }))
        } : undefined
      },
      include: {
        products: true
      }
    });
  }

  async findAll(status?: string) {
    return this.prisma.livestreams.findMany({
      where: { 
        deleted_at: null,
        status: status ? status : undefined
      },
      include: {
        _count: {
          select: { 
            products: true,
            interactions: true
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });
  }

  async findOne(id: number) {
    const livestream = await this.prisma.livestreams.findUnique({
      where: { id },
      include: {
        products: {
          include: {
            product_variants: {
              include: {
                products: true
              }
            }
          }
        },
        _count: {
          select: {
            interactions: true
          }
        },
        broadcast_messages: {
          orderBy: {
            created_at: 'desc'
          },
          take: 10
        }
      }
    });

    if (!livestream || livestream.deleted_at) {
      throw new NotFoundException(`Livestream session #${id} not found`);
    }

    return livestream;
  }

  async update(id: number, updateLivestreamDto: UpdateLivestreamDto) {
    const { product_ids, ...data } = updateLivestreamDto;

    // Handle product updates if provided (simple sync)
    if (product_ids) {
      await this.prisma.livestream_products.deleteMany({
        where: { livestream_id: id }
      });
      await this.prisma.livestream_products.createMany({
        data: product_ids.map(pid => ({
          livestream_id: id,
          variant_id: pid
        }))
      });
    }

    return this.prisma.livestreams.update({
      where: { id },
      data: {
        ...data,
        start_time: data.start_time ? new Date(data.start_time) : undefined,
      }
    });
  }

  async addProducts(id: number, variantIds: number[]) {
    return this.prisma.livestream_products.createMany({
      data: variantIds.map(vid => ({
        livestream_id: id,
        variant_id: vid
      })),
      skipDuplicates: true
    });
  }

  async removeProduct(id: number, variantId: number) {
    return this.prisma.livestream_products.delete({
      where: {
        livestream_id_variant_id: {
          livestream_id: id,
          variant_id: variantId
        }
      }
    });
  }

  async remove(id: number) {
    // Soft delete
    return this.prisma.livestreams.update({
      where: { id },
      data: { deleted_at: new Date() }
    });
  }

  async startSession(id: number) {
    return this.prisma.livestreams.update({
      where: { id },
      data: { 
        status: 'LIVE',
        start_time: new Date()
      }
    });
  }

  async endSession(id: number) {
    return this.prisma.livestreams.update({
      where: { id },
      data: { 
        status: 'ENDED',
        end_time: new Date()
      }
    });
  }

  async pinProduct(id: number, productId: number) {
    return this.prisma.livestreams.update({
      where: { id },
      data: { pinned_product_id: productId }
    });
  }

  async triggerFlashSale(id: number, variantId: number, price: number, stock: number) {
    return this.prisma.livestream_products.update({
      where: {
        livestream_id_variant_id: {
          livestream_id: id,
          variant_id: variantId
        }
      },
      data: {
        flash_sale_price: price,
        flash_sale_stock: stock
      }
    });
  }

  async recordInteraction(id: number, type: 'HEART' | 'SHARE', userId?: number) {
    await this.prisma.livestream_interactions.create({
      data: {
        livestream_id: id,
        user_id: userId,
        type_code: type
      }
    });

    // Increment counter in livestreams for quick access
    if (type === 'HEART') {
      return this.prisma.livestreams.update({
        where: { id },
        data: { hearts_count: { increment: 1 } }
      });
    } else {
      return this.prisma.livestreams.update({
        where: { id },
        data: { shares_count: { increment: 1 } }
      });
    }
  }

  async addBroadcastMessage(id: number, content: string) {
    return this.prisma.livestream_broadcast_messages.create({
      data: {
        livestream_id: id,
        content
      }
    });
  }

  async hotRestock(id: number, variantId: number, amount: number) {
    return this.prisma.product_variants.update({
      where: { variant_id: variantId },
      data: { stock_available: { increment: amount } }
    });
  }

  async getReport(id: number) {
    const livestream = await this.prisma.livestreams.findUnique({
      where: { id },
      select: { start_time: true, end_time: true }
    });

    // 1. Fetch all orders that have at least one item from this livestream
    const orders = await (this.prisma as any).orders.findMany({
      where: {
        order_items: {
          some: { livestream_id: id }
        },
        // Only PAID orders
        status_code: { in: ['PROCESSING', 'COMPLETED', 'SHIPPING', 'DELIVERED'] }
      },
      include: {
        order_items: {
          where: { livestream_id: id },
          include: {
            product_variants: {
              include: {
                products: true
              }
            }
          }
        }
      }
    });

    let totalRevenue = 0;
    let totalCost = 0;
    let commercialOrderCount = 0;

    const variantSales: Record<number, { name: string; qty: number }> = {};

    orders.forEach(order => {
      let orderHasCommercialItem = false;

      order.order_items.forEach(item => {
        const isGiveaway = !!item.giveaway_claim_id;

        if (!isGiveaway) {
          totalRevenue += Number(item.total_price);
          totalCost += Number(item.product_variants?.cost_price || 0) * item.quantity;
          orderHasCommercialItem = true;
        }

        const vid = item.variant_id;
        if (!variantSales[vid]) {
          variantSales[vid] = {
            name: item.product_variants?.products?.name || item.product_variants?.option_name || 'Item',
            qty: 0
          };
        }
        variantSales[vid].qty += item.quantity;
      });

      if (orderHasCommercialItem) {
        commercialOrderCount++;
      }
    });

    const topProduct = Object.values(variantSales).sort((a, b) => b.qty - a.qty)[0] || null;

    return {
      revenue: totalRevenue,
      profit: totalRevenue - totalCost,
      orderCount: commercialOrderCount, // Only counting unique commercial orders
      topProduct: topProduct ? `${topProduct.name} (${topProduct.qty} sold)` : 'N/A',
      startTime: livestream?.start_time,
      endTime: livestream?.end_time
    };
  }

  async getOrders(id: number) {
    const orders = await (this.prisma as any).orders.findMany({
      where: {
        order_items: {
          some: { livestream_id: id }
        },
        // Only count PAID orders
        status_code: { in: ['PROCESSING', 'COMPLETED', 'SHIPPING', 'DELIVERED'] }
      },
      include: {
        order_items: {
          where: { livestream_id: id },
          include: {
            product_variants: {
               include: {
                   products: true
               }
            }
          }
        },
        users: {
            select: {
                full_name: true,
                email: true
            }
        }
      },
      orderBy: { created_at: 'desc' },
      take: 200
    });

    const processedOrders: any[] = [];
    orders.forEach(order => {
        const commercialItems: any[] = [];
        const giveawayItems: any[] = [];
        let commercialAmount = 0;

        order.order_items.forEach(item => {
            const isGiveaway = !!item.giveaway_claim_id;
            if (isGiveaway) {
                giveawayItems.push({
                    product_name: item.product_variants?.products?.name || item.product_variants?.option_name || 'Prize',
                    quantity: item.quantity
                });
            } else {
                commercialItems.push({
                    product_name: item.product_variants?.products?.name || item.product_variants?.option_name || 'Product',
                    quantity: item.quantity,
                    price: Number(item.total_price)
                });
                commercialAmount += Number(item.total_price);
            }
        });

        // 1. If has commercial items, add as a commercial log entry
        if (commercialItems.length > 0) {
            const mainProduct = commercialItems[0].product_name;
            const extraCount = commercialItems.length - 1;
            processedOrders.push({
                order_id: order.order_id,
                customer_name: order.users?.full_name || 'Khách hàng',
                product_name: extraCount > 0 ? `${mainProduct} + ${extraCount} items` : mainProduct,
                quantity: commercialItems.reduce((sum, i) => sum + i.quantity, 0),
                amount: commercialAmount,
                time: new Date(order.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                status: order.status_code,
                type: 'COMMERCIAL'
            });
        }

        // 2. If has giveaway items, add as a giveaway win entry (for interaction)
        if (giveawayItems.length > 0) {
            giveawayItems.forEach(g => {
                processedOrders.push({
                    order_id: `G-${order.order_id}`, // Masked ID for display logic
                    customer_name: order.users?.full_name || 'Khách hàng',
                    product_name: g.product_name,
                    quantity: g.quantity,
                    amount: 0,
                    time: new Date(order.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                    status: order.status_code,
                    type: 'GIVEAWAY'
                });
            });
        }
    });

    return processedOrders;
  }


  async suggestFlashPrice(variantId: number): Promise<{ price: number; reason: string; strategy: string }> {
    const variant = await this.prisma.product_variants.findUnique({
      where: { variant_id: variantId },
      include: { 
        products: {
            include: {
                categories: true,
                brands: true,
                series: true
            }
        } 
      }
    });

    if (!variant) throw new NotFoundException('Variant not found');

    // --- ENHANCEMENT: Extract Unstructured & Historical Data ---
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentSales = await (this.prisma as any).order_items?.aggregate({
      _sum: { quantity: true },
      where: {
        variant_id: variantId,
        orders: {
            created_at: { gte: thirtyDaysAgo },
            status_code: { not: 'CANCELLED' }
        }
      }
    }).catch(() => ({ _sum: { quantity: 0 } }));

    const soldCount = recentSales?._sum?.quantity || 0;

    const costPrice = Number(variant.cost_price) || 0;
    const overheadMargin = 0.20; // 20% chi phí vận hành (Mặt bằng, nhân sự, MKT...)
    const breakEvenPrice = Math.round(costPrice * (1 + overheadMargin));

    const retailPrice = Number(variant.price) || 0;
    const stock = variant.stock_available || 0;
    const category = variant.products.categories?.name || 'Hobby';
    const brand = variant.products.brands?.name || 'Unknown';
    const series = variant.products.series?.name || 'Standard';
    const description = (variant.products.description || '').substring(0, 500); // Ngữ nghĩa/Độ hiếm

    if (!this.groq) {
      const suggested = Math.max(retailPrice * 0.85, breakEvenPrice * 1.1);
      return {
        price: Math.round(suggested),
        reason: "Default business rule: 15% discount with strictly positive net margin.",
        strategy: "STANDARD"
      };
    }

    try {
      const prompt = `
        You are a senior pricing strategist for Figicore, a premium Gundam & Hobby shop.
        Unlike a simple percentage discount script, you must use Semantic Understanding of the product description and actual Market Velocity.
        
        [PRODUCT DATA]
        Name: ${variant.products.name} (${variant.option_name})
        Category: ${category}
        Brand: ${brand}
        Series: ${series}
        Retail Price: ${retailPrice.toLocaleString()} VND
        Raw Cost Price (COGS): ${costPrice.toLocaleString()} VND
        Break-even Price (Includes 20% Overhead OPEX): ${breakEvenPrice.toLocaleString()} VND
        Current Stock: ${stock} units
        Sales Velocity (Last 30 days): ${soldCount} units sold
        Lore & Description (Look for "Limited", "Premium", "Rare"): "${description}"
        
        [TASK]
        Suggest a "Flash Sale" price for a 15-minute livestream segment.
        
        [AI STRATEGIC GUIDELINES]
        1. STRATEGY (Choose one): 
           - "LIQUIDATION": Use ONLY if Velocity (${soldCount}) is 0 and Stock is high. Goal is to recover capital for dead stock. You are allowed to set the price close to Raw Cost Price (${costPrice}), but NEVER below it.
           - "SCARCITY": Use if Stock < 5 or Description implies extreme rarity ("Limited Edition"). Minimal discount to trigger FOMO, protect brand value. MUST be comfortably above Break-even Price (${breakEvenPrice}).
           - "GROWTH": Typical balance of profit vs volume. MUST be strictly greater than Break-even Price (${breakEvenPrice}).
        2. CONSTRAINTS: 
           - If LIQUIDATION: Price MUST BE >= ${costPrice}
           - If SCARCITY/GROWTH: Price MUST BE >= ${breakEvenPrice}
        3. Round to the nearest 1,000 VND.
        
        [OUTPUT FORMAT]
        Return ONLY a JSON object:
        {
          "price": number,
          "strategy": "LIQUIDATION" | "SCARCITY" | "GROWTH",
          "reason": "short explanation explaining your read of the Velocity/Lore (in Vietnamese, max 20 words)"
        }
      `;

      const response = await this.groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        response_format: { type: "json_object" }
      });

      const res = JSON.parse(response.choices[0]?.message?.content || '{}');
      let suggestedPrice = Number(res.price) || Math.round(retailPrice * 0.85);

      // Safety check: ensure suggested price is at least costPrice + 5%
      if (suggestedPrice < costPrice * 1.05 || suggestedPrice > retailPrice) {
         suggestedPrice = Math.round(Math.max(retailPrice * 0.85, costPrice * 1.1));
      }

      return {
        price: suggestedPrice,
        strategy: res.strategy || "GROWTH",
        reason: res.reason || "Giá đề xuất dựa trên phân tích kho và giá nhập."
      };
    } catch (error) {
      console.error('Groq Pricing Suggestion Failed:', error);
      return {
        price: Math.round(Math.max(retailPrice * 0.85, costPrice * 1.1)),
        reason: "Lỗi kết nối AI, sử dụng quy tắc giá mặc định.",
        strategy: "FALLBACK"
      };
    }
  }
}
