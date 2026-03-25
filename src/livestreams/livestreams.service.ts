import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLivestreamDto } from './dto/create-livestream.dto';
import { UpdateLivestreamDto } from './dto/update-livestream.dto';

@Injectable()
export class LivestreamsService {
  constructor(private prisma: PrismaService) {}

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
    const orders = await (this.prisma as any).orders.findMany({
      where: {
        order_items: {
          some: { livestream_id: id }
        },
        status_code: { not: 'CANCELLED' } // Count Pending and Completed as "Success/Potential"
      },
      include: {
        order_items: {
          where: { livestream_id: id },
          include: {
            product_variants: true
          }
        }
      }
    });

    let totalRevenue = 0;
    let totalOrders = orders.length;
    const variantSales: Record<number, { name: string; qty: number }> = {};

    orders.forEach(order => {
      order.order_items.forEach(item => {
        totalRevenue += Number(item.total_price);
        const vid = item.variant_id;
        if (!variantSales[vid]) {
          variantSales[vid] = { name: item.product_variants.option_name, qty: 0 };
        }
        variantSales[vid].qty += item.quantity;
      });
    });

    const topProduct = Object.values(variantSales).sort((a, b) => b.qty - a.qty)[0] || null;

    return {
      revenue: totalRevenue,
      orderCount: totalOrders,
      topProduct: topProduct ? `${topProduct.name} (${topProduct.qty} sold)` : 'N/A'
    };
  }
}
