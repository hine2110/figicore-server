import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateProductPromotionDto } from './dto/create-product-promotion.dto';

@Injectable()
export class ProductPromotionsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProductPromotionDto) {
    // Basic validation
    if (new Date(dto.start_date) >= new Date(dto.end_date)) {
      throw new BadRequestException('End date must be after start date');
    }

    return this.prisma.product_promotions.create({
      data: {
        name: dto.name,
        type_code: dto.type_code,
        value: dto.value,
        start_date: new Date(dto.start_date),
        end_date: new Date(dto.end_date),
        is_active: dto.is_active ?? true,
        min_apply_price: dto.min_apply_price,
        max_apply_price: dto.max_apply_price,
      },
    });
  }

  async findAll() {
    return this.prisma.product_promotions.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        _count: {
          select: { products: true }
        }
      }
    });
  }

  async findOne(id: number) {
    const promo = await this.prisma.product_promotions.findUnique({
      where: { promotion_id: id },
      include: { products: { select: { product_id: true, name: true } } }
    });
    if (!promo) throw new BadRequestException('Promotion not found');
    return promo;
  }

  async applyToProducts(id: number, productIds: number[]) {
    const promo = await this.findOne(id);
    
    // Update products to point to this promotion
    return this.prisma.products.updateMany({
      where: { product_id: { in: productIds } },
      data: { product_promotion_id: id }
    });
  }

  async removeFromProducts(id: number, productIds: number[]) {
    return this.prisma.products.updateMany({
      where: { 
        product_id: { in: productIds },
        product_promotion_id: id 
      },
      data: { product_promotion_id: null }
    });
  }

  async remove(id: number) {
    // Soft delete
    return this.prisma.product_promotions.update({
      where: { promotion_id: id },
      data: { 
        deleted_at: new Date(),
        is_active: false 
      }
    });
  }

  async applyToPriceRange(id: number, minPrice: number, maxPrice: number) {
    // 1. Find products that have at least one variant in the price range
    const products = await this.prisma.products.findMany({
      where: {
        type_code: 'RETAIL', // STRICT LOCK: Only RETAIL products
        product_variants: {
          some: {
            price: {
              gte: minPrice,
              lte: maxPrice,
            },
          },
        },
      },
      select: { product_id: true }
    });

    if (products.length === 0) {
      return { count: 0, message: 'No products found in this price range' };
    }

    const productIds = products.map(p => p.product_id);

    // 2. Bulk Update products to link to this promotion
    // NOTE: Schema defines specific 1-N relation (product_promotion_id in products table), 
    // so we use updateMany instead of creating entries in a non-existent linking table.
    const updateResult = await this.prisma.products.updateMany({
      where: {
        product_id: { in: productIds }
      },
      data: {
        product_promotion_id: id
      }
    });

    return { 
      count: updateResult.count, 
      message: `Successfully applied promotion to ${updateResult.count} products` 
    };
  }
}
