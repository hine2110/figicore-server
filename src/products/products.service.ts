import { Injectable, BadRequestException, ServiceUnavailableException, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
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
          status_code: productData.status_code || 'ACTIVE', // Default ACTIVE if not provided
        },
      });

      // 2. Process Variants
      if (variants && variants.length > 0) {
        for (const variantDto of variants) {
          // Prepare Core Variant Data
          const isPreorder = productData.type_code === 'PREORDER';

          const variantData = {
            product_id: product.product_id,
            option_name: variantDto.option_name,
            sku: variantDto.sku || genCode('SKU'),
            barcode: variantDto.barcode || genCode('BAR'),
            media_assets: variantDto.media_assets ? (variantDto.media_assets as any) : JSON.stringify([]),
            description: variantDto.description,
            // Physical Specs
            weight_g: variantDto.weight_g || 200,
            length_cm: variantDto.length_cm || 10,
            width_cm: variantDto.width_cm || 10,
            height_cm: variantDto.height_cm || 10,

            // New Specs
            scale: variantDto.scale,
            material: variantDto.material,
            included_items: variantDto.included_items ? (variantDto.included_items as any) : undefined,

            // Retail Logic Guard: Force 0 for Pre-order
            price: isPreorder ? 0 : variantDto.price,
            stock_available: isPreorder ? 0 : (variantDto.stock_available ?? 0),
            stock_defect: variantDto.stock_defect ?? 0
          };

          // Step C: Insert Core Variant
          const createdVariant = await tx.product_variants.create({
            data: variantData,
          });

          // Step D: Handle Extensions
          if (isPreorder && variantDto.preorder_config) {
            await tx.product_preorder_configs.create({
              data: {
                variant_id: createdVariant.variant_id,
                deposit_amount: variantDto.preorder_config.deposit_amount,
                full_price: variantDto.preorder_config.full_price,
                total_slots: variantDto.preorder_config.total_slots,
                sold_slots: 0,
                max_qty_per_user: variantDto.preorder_config.max_qty_per_user ?? 2,
                release_date: preorder?.release_date ? new Date(preorder.release_date) : null,
                // stock_held: 0 (default)
              },
            });
          }
        }
      }

      // Handle Blindbox extension (Legacy Logic preserved for completeness if needed, 
      // but strictly following the request which focused on Pre-order structure)
      if (productData.type_code === 'BLINDBOX' && blindbox) {
        // ... Blindbox logic is separate, but making sure we don't break it.
        // Since the user focused on the 'Logic Flow' for Pre-order, I will retain the blindbox block 
        // BUT move it after the loop or handle it if it was part of variants.
        // Blindbox creates its own special single variant usually.

        // Re-implementing Blindbox logic briefly to ensure it works
        const price = Number(blindbox.price);
        const minVal = Number(blindbox.min_value_allow);
        const maxVal = Number(blindbox.max_value_allow);
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

        // Ensure a blindbox variant exists if not in 'variants' array
        // Usually Blindbox has 1 variant.
        await tx.product_variants.create({
          data: {
            product_id: product.product_id,
            sku: genCode('BBOX'),
            barcode: genCode('BAR'),
            option_name: 'Blindbox Standard',
            price: blindbox.price,
            media_assets: JSON.stringify([]),
            stock_available: 0
          }
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
          product_variants: {
            include: { product_preorder_configs: true }
          },
          product_blindboxes: true,
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
            { product_variants: { some: { sku: { contains: search, mode: 'insensitive' } } } },
            { product_variants: { some: { option_name: { contains: search, mode: 'insensitive' } } } }
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

    // Dynamic Sort Logic (price sorting handled client-side)
    let orderBy: any = { created_at: 'desc' }; // Default: Newest first (Featured)

    if (sort === 'newest') {
      orderBy = { created_at: 'desc' };
    } else if (sort === 'name') {
      orderBy = { name: 'asc' };
    }
    // Note: price_asc and price_desc are handled in the frontend

    return this.prisma.products.findMany({
      where,
      include: {
        brands: true,
        categories: true,
        series: true,
        product_variants: {
          where: { deleted_at: null },
          include: { product_preorder_configs: true }
        },
        product_blindboxes: true
      },
      orderBy
    });
  }

  /**
   * POS Product Search - Tìm kiếm sản phẩm cho POS
   * Trả về variants với tồn kho, giá, hình ảnh
   */
  async posSearch(query: { q?: string, category_id?: string, brand_id?: string, min_price?: number, max_price?: number, sort?: string }) {
    const { q, category_id, brand_id, min_price, max_price, sort } = query;

    // Build where clause cho products
    const productWhere: Prisma.productsWhereInput = {
      status_code: 'ACTIVE', // Chỉ lấy sản phẩm active
      deleted_at: null,
      AND: [
        // Search by product name or SKU
        q ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { product_variants: { some: { sku: { contains: q, mode: 'insensitive' } } } }
          ]
        } : {},
        // Filter by category
        category_id ? { category_id: Number(category_id) } : {},
        // Filter by brand
        brand_id ? { brand_id: Number(brand_id) } : {},
        // Filter by Price Range (at least one variant matches)
        (min_price !== undefined || max_price !== undefined) ? {
          product_variants: {
            some: {
              price: {
                gte: min_price || 0,
                lte: max_price || 9999999999
              }
            }
          }
        } : {}
      ]
    };

    // Sorting Logic
    let orderBy: any = { name: 'asc' }; // Default POS sort
    if (sort === 'newest') {
      orderBy = { created_at: 'desc' };
    } else if (sort === 'name_asc') {
      orderBy = { name: 'asc' };
    } else if (sort === 'name_desc') {
      orderBy = { name: 'desc' };
    }
    // Note: price sorting for grouped products is complex via SQL, 
    // we'll handle basic text/date sorting here. 
    // If sort is price_asc/desc, we might need a different approach or client-side sort for the grouped result.
    // Let's stick to these for now.

    // Lấy products với variants
    const products = await this.prisma.products.findMany({
      where: productWhere,
      include: {
        product_variants: {
          where: {
            deleted_at: null,
          }
        },
        categories: true,
        brands: true,
      },
      orderBy: orderBy,
    });

    // Group by product and return with variants array
    const groupedProducts = products.map(product => {
      // Get all active variants with stock > 0
      const activeVariants = product.product_variants
        .filter(v => (v.stock_available || 0) > 0)
        .map(variant => {
          // Get thumbnail from media_urls or media_assets
          let thumbnail = null;

          // Try product.media_urls first
          if (product.media_urls && typeof product.media_urls === 'object') {
            const mediaArray = Array.isArray(product.media_urls)
              ? product.media_urls
              : (product.media_urls as any).images || [];
            thumbnail = mediaArray[0] || null;
          }

          // Fallback to variant.media_assets
          if (!thumbnail && variant.media_assets) {
            try {
              const assets = typeof variant.media_assets === 'string'
                ? JSON.parse(variant.media_assets)
                : variant.media_assets;
              thumbnail = Array.isArray(assets) && assets[0] ? assets[0] : null;
            } catch (e) {
              thumbnail = null;
            }
          }

          return {
            variant_id: variant.variant_id,
            sku: variant.sku,
            option_name: variant.option_name,
            price: Number(variant.price),
            current_stock: variant.stock_available || 0,
            thumbnail: thumbnail,
          };
        });

      // Only return products that have at least one available variant
      if (activeVariants.length === 0) return null;

      // Use first variant's thumbnail for product thumbnail
      const productThumbnail = activeVariants[0]?.thumbnail || null;

      return {
        product_id: product.product_id,
        product_name: product.name,
        thumbnail: productThumbnail,
        category: product.categories?.name || 'Uncategorized',
        brand: product.brands?.name || null,
        product_type: product.type_code,
        variants: activeVariants,
      };
    }).filter((p): p is NonNullable<typeof p> => p !== null); // Remove null entries and narrow type

    // Sorting grouped products
    const sortedProducts = groupedProducts.sort((a, b) => {
      if (sort === 'price_asc') {
        const minA = Math.min(...a.variants.map((v: any) => v.price));
        const minB = Math.min(...b.variants.map((v: any) => v.price));
        return minA - minB;
      } else if (sort === 'price_desc') {
        const maxA = Math.max(...a.variants.map((v: any) => v.price));
        const maxB = Math.max(...b.variants.map((v: any) => v.price));
        return maxB - maxA;
      }
      return 0; // Already sorted by name/date via SQL if sort is name_* or newest
    });

    return {
      success: true,
      count: sortedProducts.length,
      data: sortedProducts,
    };
  }


  async findSimilar(id: number) {
    const product = await this.prisma.products.findUnique({
      where: { product_id: id },
      include: { series: true, brands: true, categories: true }
    });

    if (!product) return [];

    let similarProducts: any[] = []; // Explicit type to avoid never[] inference
    const limit = 4;

    // 1. Priority: Same Series
    if (product.series_id) {
      const bySeries = await this.prisma.products.findMany({
        where: {
          series_id: product.series_id,
          product_id: { not: id },
          status_code: 'ACTIVE' // Changed from status to status_code
        },
        take: limit,
        include: {
          brands: true,
          categories: true,
          series: true,
          product_variants: { include: { product_preorder_configs: true } },
          product_blindboxes: true
        }
      });
      similarProducts = [...bySeries];
    }

    // 2. Priority: Same Brand
    if (similarProducts.length < limit && product.brand_id) {
      const byBrand = await this.prisma.products.findMany({
        where: {
          brand_id: product.brand_id,
          product_id: { not: id, notIn: similarProducts.map(p => p.product_id) },
          status_code: 'ACTIVE' // Changed from status to status_code
        },
        take: limit - similarProducts.length,
        include: {
          brands: true,
          categories: true,
          series: true,
          product_variants: { include: { product_preorder_configs: true } },
          product_blindboxes: true
        }
      });
      similarProducts = [...similarProducts, ...byBrand];
    }

    // 3. Priority: Same Category
    if (similarProducts.length < limit && product.category_id) {
      const byCategory = await this.prisma.products.findMany({
        where: {
          category_id: product.category_id,
          product_id: { not: id, notIn: similarProducts.map(p => p.product_id) },
          status_code: 'ACTIVE' // Changed from status to status_code
        },
        take: limit - similarProducts.length,
        include: {
          brands: true,
          categories: true,
          series: true,
          product_variants: { include: { product_preorder_configs: true } },
          product_blindboxes: true
        }
      });
      similarProducts = [...similarProducts, ...byCategory];
    }

    return similarProducts;
  }


  async findOne(id: number) {
    const product = await this.prisma.products.findUnique({
      where: { product_id: id },
      include: {
        product_variants: {
          where: { deleted_at: null },
          include: { product_preorder_configs: true }
        },
        product_blindboxes: true,
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
                description: v.description,
                media_assets: v.media_assets ? (v.media_assets as any) : undefined, // Update media_assets
                weight_g: v.weight_g,
                length_cm: v.length_cm,
                width_cm: v.width_cm,
                height_cm: v.height_cm,
                scale: v.scale,
                material: v.material,
                included_items: v.included_items ? (v.included_items as any) : undefined,
                stock_available: v.stock_available, // Retail specific
                stock_defect: v.stock_defect
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
                description: v.description,
                media_assets: v.media_assets ? (v.media_assets as any) : JSON.stringify([]),
                stock_available: v.stock_available || 0,
                stock_defect: v.stock_defect || 0,
                weight_g: v.weight_g || 200,
                length_cm: v.length_cm || 10,
                width_cm: v.width_cm || 10,
                height_cm: v.height_cm || 10,
                scale: v.scale,
                material: v.material,
                included_items: v.included_items ? (v.included_items as any) : undefined,
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

        if (variants && variants.length > 0) {
          for (const v of variants) {
            const existingVariant = await tx.product_variants.findUnique({
              where: { sku: v.sku },
            });

            if (existingVariant && existingVariant.product_id !== id) {
              // Skip or throw
            }

            let variantId = existingVariant?.variant_id;

            if (existingVariant) {
              await tx.product_variants.update({
                where: { variant_id: existingVariant.variant_id },
                data: {
                  option_name: v.option_name,
                  price: 0, // Retail price 0
                  barcode: v.barcode,
                  description: v.description,
                  media_assets: v.media_assets ? (v.media_assets as any) : undefined,
                  weight_g: v.weight_g,
                  length_cm: v.length_cm,
                  width_cm: v.width_cm,
                  height_cm: v.height_cm,
                  scale: v.scale,
                  material: v.material,
                  included_items: v.included_items ? (v.included_items as any) : undefined,
                },
              });
            } else {
              // CREATE NEW VARIANT
              const newVariant = await tx.product_variants.create({
                data: {
                  product_id: id,
                  sku: v.sku,
                  option_name: v.option_name,
                  price: 0,
                  stock_available: 0,
                  barcode: v.barcode,
                  description: v.description,
                  media_assets: v.media_assets ? (v.media_assets as any) : JSON.stringify([]),
                  weight_g: v.weight_g || 200,
                  length_cm: v.length_cm || 10,
                  width_cm: v.width_cm || 10,
                  height_cm: v.height_cm || 10,
                  scale: v.scale,
                  material: v.material,
                  included_items: v.included_items ? (v.included_items as any) : undefined,
                },
              });
              variantId = newVariant.variant_id;
            }

            // UPSERT Preorder Config (Decoupled)
            if (variantId && v.preorder_config) {
              await tx.product_preorder_configs.upsert({
                where: { variant_id: variantId },
                create: {
                  variant_id: variantId,
                  deposit_amount: v.preorder_config.deposit_amount,
                  full_price: v.preorder_config.full_price,
                  total_slots: v.preorder_config.total_slots,
                  sold_slots: 0,
                  max_qty_per_user: v.preorder_config.max_qty_per_user ?? 2,
                  release_date: new Date(preorder.release_date)
                },
                update: {
                  deposit_amount: v.preorder_config.deposit_amount,
                  full_price: v.preorder_config.full_price,
                  total_slots: v.preorder_config.total_slots,
                  max_qty_per_user: v.preorder_config.max_qty_per_user,
                  release_date: new Date(preorder.release_date)
                }
              });
            }
          }
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

  async findAttributeSuggestions(key: string) {
    const allowedKeys = ['scale', 'material'];
    if (!allowedKeys.includes(key)) {
      return [];
    }

    // Using raw query for distinct might be overkill if findMany distinct works well. 
    // Prisma distinct is cleaner.
    const results = await this.prisma.product_variants.findMany({
      where: {
        [key]: { not: null }
      },
      select: {
        [key]: true
      },
      distinct: [key as Prisma.Product_variantsScalarFieldEnum],
      take: 50 // Limit suggestions to 50
    });

    return results.map(item => (item as any)[key]).filter(val => val !== null && val !== "");
  }

  async generateAiDescription(dto: {
    productName: string;
    variantName?: string;
    userContext?: string;
    imageUrl?: string;
    richContext?: any;
  }) {
    if (!process.env.GEMINI_API_KEY) {
      throw new ServiceUnavailableException("AI service is not configured (Missing API Key).");
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const context = dto.userContext ? `User Notes/Context: "${dto.userContext}"` : "User Notes: N/A";
    const variantContext = dto.variantName ? `Target Specific Variant: "${dto.variantName}"` : "Target: Main Product Overview";

    // RICH CONTEXT PROCESSING
    let richContextString = "";
    if (dto.richContext) {
      const { brand, category, series, variants } = dto.richContext as any;
      if (brand) richContextString += `Brand: ${brand}\n`;
      if (category) richContextString += `Category: ${category}\n`;
      if (series) richContextString += `Series: ${series}\n`;

      // Variant Specifics (if available for the target)
      if (dto.variantName && variants) {
        // Try to find the specific variant data or use the generic structure passed
        // Assuming variants is an object with details
        const v = variants; // If we pass the specific variant object directly
        if (v.scale) richContextString += `Scale: ${v.scale}\n`;
        if (v.material) richContextString += `Material: ${v.material}\n`;
        if (v.included_items) richContextString += `Included Items: ${v.included_items}\n`;
        if (v.price) richContextString += `Price: ${v.price} VND\n`;
      }
    }

    const prompt = `
            Role: Expert Copywriter for Collectibles (Gunpla, Figures, Toys).
            Task: Write a professional, engaging description in Vietnamese.
            
            Product: ${dto.productName}
            ${variantContext}
            ${context}
            
            Technical Specs & Classification:
            ${richContextString}
            
            Guidelines:
            1. **Tone**: Enthusiastic, professional, "Dan choi" friendly (Otaku culture aware).
            2. **Content**: Use the Technical Specs (Scale, Material, Brand, etc.) to enhance the description. If an image is provided, describe visual details.
            3. **Format**: Plain text, clear paragraph breaks, 2-3 paragraphs max. Use relevant emojis 🤖✨.
            4. **Hallucination Check**: Only describe features visible in the image or explicitly stated.
            5. **Language**: Vietnamese.
        `;

    const parts: any[] = [prompt];

    // MULTIMODAL: Fetch Image if provided
    if (dto.imageUrl) {
      try {
        const imgResp = await fetch(dto.imageUrl);
        if (imgResp.ok) {
          const arrayBuffer = await imgResp.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          parts.push({
            inlineData: {
              data: buffer.toString("base64"),
              mimeType: imgResp.headers.get("content-type") || "image/jpeg"
            }
          });
        } else {
          Logger.warn(`Failed to fetch AI Image: ${dto.imageUrl}`);
        }
      } catch (imgErr) {
        Logger.error("AI Image Fetch Error", imgErr);
      }
    }

    // GENERATION LOGIC WITH FALLBACK
    try {
      try {
        // Attempt 1: Gemini Flash Latest
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        const result = await model.generateContent(parts);
        const response = await result.response;
        return { text: response.text() };
      } catch (primaryError) {
        Logger.warn(`Primary Model (gemini-flash-latest) failed: ${primaryError.message}. Retrying with Fallback...`);

        // Attempt 2: Fallback to Stable 1.5 Flash
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(parts);
        const response = await result.response;
        return { text: response.text() };
      }
    } catch (finalError) {
      Logger.error("AI Gen Failed (All Models)", finalError);
      throw new ServiceUnavailableException("AI service is currently unavailable. Please try again later.");
    }
  }
}
