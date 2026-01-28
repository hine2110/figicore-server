import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) { }

  async create(createProductDto: CreateProductDto) {
    const {
      variants,
      blindbox,
      preorder,
      ...productData
    } = createProductDto;

    // Helper: Generate SKU/Barcode
    const genCode = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    return await this.prisma.$transaction(async (tx) => {
      // 1. Create Parent Product
      const product = await tx.products.create({
        data: {
          name: productData.name,
          type_code: productData.type_code,
          brand_id: productData.brand_id,
          category_id: productData.category_id,
          series_id: productData.series_id,
          description: productData.description,
          media_urls: productData.media_urls ? (productData.media_urls as any) : Prisma.JsonNull,
          status_code: 'ACTIVE',
        },
      });

      // 2. Handle Variants & Type Specifics
      const commonVariantData = {
        product_id: product.product_id,
        stock_available: 0,
        stock_defect: 0,
      };

      if (productData.type_code === 'RETAIL') {
        if (!variants || variants.length === 0) {
          throw new BadRequestException('Retail products must have at least one variant.');
        }

        await tx.product_variants.createMany({
          data: variants.map(v => ({
            ...commonVariantData,
            sku: genCode('SKU'),
            barcode: genCode('BAR'),
            option_name: v.option_name,
            price: v.price,
            media_assets: v.media_assets ? (v.media_assets as any) : JSON.stringify([]), // Map media_assets
          }))
        });
      }

      else if (productData.type_code === 'BLINDBOX') {
        if (!blindbox) throw new BadRequestException('Blindbox configuration is required.');

        // Weighted Random Algorithm: Auto-Calculate Tiers
        const price = Number(blindbox.price);
        const minVal = Number(blindbox.min_value_allow);
        const maxVal = Number(blindbox.max_value_allow);

        // Tier Logic
        // Tier 1 (Common - 80%): [Min, Price]
        // Tier 2 (Rare - 15%): (Price, Price + (Max - Price) * 0.7]
        // Tier 3 (Legend - 5%): (Tier 2 Max, Max]

        const tier2Max = price + (maxVal - price) * 0.7;

        const tiers = [
          { probability: 80, min: minVal, max: price, name: "Common" },
          { probability: 15, min: price + 1, max: tier2Max, name: "Rare" },
          { probability: 5, min: tier2Max + 1, max: maxVal, name: "Legendary" }
        ];

        await tx.product_blindboxes.create({
          data: {
            product_id: product.product_id,
            price: blindbox.price,
            min_value: blindbox.min_value_allow,
            max_value: blindbox.max_value_allow,
            tier_config: JSON.stringify(tiers) as any
          }
        });

        // Smart Variant: Sync Single Variant
        await tx.product_variants.create({
          data: {
            ...commonVariantData,
            sku: genCode('BBOX'),
            barcode: genCode('BAR'),
            option_name: 'Blindbox Standard',
            price: blindbox.price,
            media_assets: JSON.stringify([])
          }
        });
      }

      else if (productData.type_code === 'PREORDER') {
        if (!preorder) throw new BadRequestException('Preorder configuration is required.');

        await tx.product_preorders.create({
          data: {
            product_id: product.product_id,
            deposit_amount: preorder.deposit_amount,
            full_price: preorder.full_price,
            release_date: new Date(preorder.release_date),
            max_slots: preorder.max_slots
          }
        });

        // Smart Variants: Generate TWO variants
        await tx.product_variants.createMany({
          data: [
            {
              ...commonVariantData,
              sku: genCode('PRE-DEP'),
              barcode: genCode('BAR-DEP'),
              option_name: 'Deposit (Cọc)',
              price: preorder.deposit_amount,
              media_assets: JSON.stringify([])
            },
            {
              ...commonVariantData,
              sku: genCode('PRE-FULL'),
              barcode: genCode('BAR-FULL'),
              option_name: 'Full Payment (Trả thẳng)',
              price: preorder.full_price,
              media_assets: JSON.stringify([])
            }
          ]
        });
      }

      return product;
    });
  }

  async quickCreate(data: { name: string, brand_id?: number, variant_names?: string[] }) {
    const { name, brand_id, variant_names } = data;
    const names = (variant_names && variant_names.length > 0) ? variant_names : ['Default'];

    // 1. Validate Brand if provided
    if (brand_id) {
      const brand = await this.prisma.brands.findUnique({ where: { brand_id } });
      if (!brand) throw new BadRequestException('Brand not found');
    }

    return await this.prisma.$transaction(async (tx) => {
      const product = await tx.products.create({
        data: {
          name,
          brand_id,
          type_code: 'RETAIL',
          status_code: 'DRAFT', // Explicitly DRAFT
          media_urls: Prisma.JsonNull,
        }
      });

      await tx.product_variants.createMany({
        data: names.map((vName, idx) => ({
          product_id: product.product_id,
          option_name: vName,
          sku: `DRAFT-${Date.now()}-${idx}`,
          barcode: `DRAFT-${Date.now()}-${idx}`,
          price: 0,
          stock_available: 0,
          stock_defect: 0,
          media_assets: JSON.stringify([])
        }))
      });

      // Fetch result using the SAME transaction client to ensure visibility
      return await tx.products.findUnique({
        where: { product_id: product.product_id },
        include: {
          product_variants: true,
          product_blindboxes: true,
          product_preorders: true,
          brands: true,
          categories: true,
          series: true
        }
      });
    });
  }

  findAll(params: { search?: string, brand_id?: number, category_id?: number, series_id?: number, type_code?: any, min_price?: number, max_price?: number, sort?: string }) {
    const { search, brand_id, category_id, series_id, type_code, min_price, max_price, sort } = params;

    const where: Prisma.productsWhereInput = {
      AND: [
        // 1. Exact Filters
        type_code ? { type_code: type_code } : {},
        brand_id ? { brand_id: Number(brand_id) } : {},
        category_id ? { category_id: Number(category_id) } : {},
        series_id ? { series_id: Number(series_id) } : {},

        // 2. Search Logic (Name OR SKU)
        search ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { product_variants: { some: { sku: { contains: search, mode: 'insensitive' } } } }
          ]
        } : {},

        // 3. Price Filter (Check if ANY variant matches the price range)
        (min_price !== undefined || max_price !== undefined) ? {
          product_variants: {
            some: {
              price: {
                gte: min_price || 0,
                lte: max_price || 999999999
              }
            }
          }
        } : {}
      ]
    };

    return this.prisma.products.findMany({
      where,
      include: {
        brands: true,
        categories: true,
        series: true,
        product_variants: true,
        product_blindboxes: true,
        product_preorders: true
      },
      orderBy: { created_at: 'desc' }
    });
  }

  async findOne(id: number) {
    const product = await this.prisma.products.findUnique({
      where: { product_id: id },
      include: {
        product_variants: { where: { deleted_at: null } },
        product_blindboxes: true,
        product_preorders: true,
        brands: true,
        categories: true,
        series: true
      }
    });
    if (!product) throw new BadRequestException('Product not found');
    return product;
  }

  async update(id: number, updateProductDto: UpdateProductDto) {
    const {
      variants,
      blindbox,
      preorder,
      ...productData
    } = updateProductDto;

    const currentProduct = await this.prisma.products.findUnique({
      where: { product_id: id },
      include: { product_variants: true }
    });
    if (!currentProduct) throw new BadRequestException('Product not found');

    return await this.prisma.$transaction(async (tx) => {
      // Update Parent
      if (productData.type_code && productData.type_code !== currentProduct.type_code) {
        throw new BadRequestException('Changing product type is not allowed.');
      }

      await tx.products.update({
        where: { product_id: id },
        data: {
          name: productData.name,
          brand_id: productData.brand_id,
          category_id: productData.category_id,
          series_id: productData.series_id,
          description: productData.description,
          media_urls: productData.media_urls ? (productData.media_urls as any) : undefined,
          status_code: productData.status_code,
        },
      });

      const type = currentProduct.type_code;

      if (type === 'RETAIL' && variants && variants.length > 0) {
        for (const v of variants) {
          const existingVariant = await tx.product_variants.findUnique({
            where: { sku: v.sku },
          });

          if (existingVariant && existingVariant.product_id !== id) {
            throw new BadRequestException(`SKU ${v.sku} is already in use by another product.`);
          }

          if (existingVariant) {
            await tx.product_variants.update({
              where: { variant_id: existingVariant.variant_id },
              data: {
                option_name: v.option_name,
                price: v.price,
                barcode: v.barcode,
                media_assets: v.media_assets ? (v.media_assets as any) : undefined, // Update media_assets
              },
            });
          } else {
            await tx.product_variants.create({
              data: {
                product_id: id,
                sku: v.sku,
                option_name: v.option_name,
                price: v.price,
                barcode: v.barcode,
                media_assets: v.media_assets ? (v.media_assets as any) : JSON.stringify([]),
                stock_available: v.stock_available || 0,
                stock_defect: v.stock_defect || 0,
              },
            });
          }
        }
      }

      else if (type === 'BLINDBOX' && blindbox) {
        // Weighted Random Algorithm: Auto-Calculate Tiers (Same as Create)
        const price = Number(blindbox.price);
        const minVal = Number(blindbox.min_value_allow);
        const maxVal = Number(blindbox.max_value_allow);

        const tier2Max = price + (maxVal - price) * 0.7;

        const tiers = [
          { probability: 80, min: minVal, max: price, name: "Common" },
          { probability: 15, min: price + 1, max: tier2Max, name: "Rare" },
          { probability: 5, min: tier2Max + 1, max: maxVal, name: "Legendary" }
        ];

        await tx.product_blindboxes.upsert({
          where: { product_id: id },
          create: {
            product_id: id,
            price: blindbox.price,
            min_value: blindbox.min_value_allow,
            max_value: blindbox.max_value_allow,
            tier_config: JSON.stringify(tiers) as any
          },
          update: {
            price: blindbox.price,
            min_value: blindbox.min_value_allow,
            max_value: blindbox.max_value_allow,
            tier_config: JSON.stringify(tiers) as any
          },
        });
        await tx.product_variants.updateMany({
          where: { product_id: id },
          data: { price: blindbox.price }
        });
      }

      else if (type === 'PREORDER' && preorder) {
        await tx.product_preorders.upsert({
          where: { product_id: id },
          create: {
            product_id: id,
            deposit_amount: preorder.deposit_amount,
            full_price: preorder.full_price,
            release_date: new Date(preorder.release_date),
            max_slots: preorder.max_slots,
          },
          update: {
            deposit_amount: preorder.deposit_amount,
            full_price: preorder.full_price,
            release_date: new Date(preorder.release_date),
            max_slots: preorder.max_slots,
          },
        });

        const existingVariants = currentProduct.product_variants;
        const depositVariant = existingVariants.find(v => v.option_name.includes('Deposit') || v.option_name.includes('Cọc'));
        const fullVariant = existingVariants.find(v => v.option_name.includes('Full') || v.option_name.includes('Trả thẳng'));

        if (depositVariant) {
          await tx.product_variants.update({ where: { variant_id: depositVariant.variant_id }, data: { price: preorder.deposit_amount } });
        }
        if (fullVariant) {
          await tx.product_variants.update({ where: { variant_id: fullVariant.variant_id }, data: { price: preorder.full_price } });
        }
      }

      return this.findOne(id);
    });
  }

  async toggleStatus(id: number) {
    const product = await this.prisma.products.findUnique({ where: { product_id: id } });
    if (!product) throw new BadRequestException('Product not found');

    const newStatus = product.status_code === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    return await this.prisma.products.update({
      where: { product_id: id },
      data: { status_code: newStatus }
    });
  }

  async remove(id: number) {
    const product = await this.prisma.products.findUnique({ where: { product_id: id } });
    if (!product) throw new BadRequestException('Product not found');

    return await this.prisma.products.update({
      where: { product_id: id },
      data: {
        status_code: 'INACTIVE',
        deleted_at: new Date(),
      },
    });
  }
}
