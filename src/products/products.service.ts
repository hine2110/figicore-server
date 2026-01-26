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
        stock_available: 0, // FORCE 0
        stock_defect: 0,
      };

      if (productData.type_code === 'RETAIL') {
        if (!variants || variants.length === 0) {
          throw new BadRequestException('Retail products must have at least one variant.');
        }

        await tx.product_variants.createMany({
          data: variants.map(v => ({
            ...commonVariantData,
            sku: genCode('SKU'), // Auto-gen SKU, ignoring FE input
            barcode: genCode('BAR'), // Auto-gen Barcode
            option_name: v.option_name,
            price: v.price,
            image_url: v.image_url
          }))
        });
      }

      else if (productData.type_code === 'BLINDBOX') {
        if (!blindbox) throw new BadRequestException('Blindbox configuration is required.');

        await tx.product_blindboxes.create({
          data: {
            product_id: product.product_id,
            price: blindbox.price,
            min_value_allow: blindbox.min_value_allow,
            max_value_allow: blindbox.max_value_allow,
            target_margin: blindbox.target_margin
          }
        });

        // Smart Variant: Sync Single Variant
        await tx.product_variants.create({
          data: {
            ...commonVariantData,
            sku: genCode('BBOX'),
            barcode: genCode('BAR'),
            option_name: 'Blindbox Standard',
            price: blindbox.price
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

        // Smart Variants: Generate TWO variants (Deposit & Full)
        await tx.product_variants.createMany({
          data: [
            {
              ...commonVariantData,
              sku: genCode('PRE-DEP'),
              barcode: genCode('BAR-DEP'),
              option_name: 'Deposit (Cọc)',
              price: preorder.deposit_amount
            },
            {
              ...commonVariantData,
              sku: genCode('PRE-FULL'),
              barcode: genCode('BAR-FULL'),
              option_name: 'Full Payment (Trả thẳng)',
              price: preorder.full_price
            }
          ]
        });
      }

      return product;
    });
  }

  findAll() {
    return this.prisma.products.findMany({
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
        product_variants: true,
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

    // 1. Check if product exists
    const currentProduct = await this.prisma.products.findUnique({
      where: { product_id: id },
      include: { product_variants: true } // Need to know existing variants
    });
    if (!currentProduct) throw new BadRequestException('Product not found');

    return await this.prisma.$transaction(async (tx) => {
      // 2. Update Parent Product
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

      // 3. Handle Sub-Types based on CURRENT type
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
                image_url: v.image_url,
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
                image_url: v.image_url,
                stock_available: v.stock_available || 0,
                stock_defect: v.stock_defect || 0,
              },
            });
          }
        }
      }

      else if (type === 'BLINDBOX' && blindbox) {
        await tx.product_blindboxes.upsert({
          where: { product_id: id },
          create: {
            product_id: id,
            price: blindbox.price,
            min_value_allow: blindbox.min_value_allow,
            max_value_allow: blindbox.max_value_allow,
            target_margin: blindbox.target_margin,
          },
          update: {
            price: blindbox.price,
            min_value_allow: blindbox.min_value_allow,
            max_value_allow: blindbox.max_value_allow,
            target_margin: blindbox.target_margin,
          },
        });

        // Smart Sync: Update ALL variants to match Ticket Price
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

        // smart Sync: Update explicit variants 'Deposit' and 'Full Payment'
        // Strategy: find by option_name contains/matches, or update if only 2 exist in order.
        // Robust approach: If we have specific variants, update them. If not, maybe create them.
        // Simpler for now: Check overlapping names.

        const existingVariants = currentProduct.product_variants;
        const depositVariant = existingVariants.find(v => v.option_name.includes('Deposit') || v.option_name.includes('Cọc'));
        const fullVariant = existingVariants.find(v => v.option_name.includes('Full') || v.option_name.includes('Trả thẳng'));

        if (depositVariant) {
          await tx.product_variants.update({
            where: { variant_id: depositVariant.variant_id },
            data: { price: preorder.deposit_amount }
          });
        }
        if (fullVariant) {
          await tx.product_variants.update({
            where: { variant_id: fullVariant.variant_id },
            data: { price: preorder.full_price }
          });
        }
        // Fallback: If for some reason they don't exist (legacy data), created them? 
        // Skipping complex migration logic here to keep it simple, assuming new products or standard flow.
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
        status_code: 'INACTIVE', // Soft Delete status
        deleted_at: new Date(),
      },
    });
  }
}
