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
            description: v.description, // Map description
            media_assets: v.media_assets ? (v.media_assets as any) : JSON.stringify([]), // Map media_assets
            weight_g: v.weight_g || 200,
            length_cm: v.length_cm || 10,
            width_cm: v.width_cm || 10,
            height_cm: v.height_cm || 10,
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

        // 1. Create Preorder Info (Metadata Only)
        await tx.product_preorders.create({
          data: {
            product_id: product.product_id,
            release_date: new Date(preorder.release_date),
            // Removed: deposit_amount, full_price, max_slots (Now in variants)
          }
        });

        // 2. Variants from DTO (Supports Multivariant Preorder)
        if (variants && variants.length > 0) {
          await tx.product_variants.createMany({
            data: variants.map(v => ({
              ...commonVariantData,
              sku: v.sku || genCode('PRE-SKU'),
              barcode: v.barcode || genCode('PRE-BAR'),
              option_name: v.option_name,
              price: v.price,                         // FULL PRICE from frontend
              deposit_amount: v.deposit_amount || 0,  // <--- VARIANT DEPOSIT
              stock_available: 0,                     // Physical stock is 0
              preorder_slot_limit: v.preorder_slot_limit || v.stock_available || 0, // <--- SLOT LIMIT
              description: v.description,
              media_assets: v.media_assets ? (v.media_assets as any) : JSON.stringify([]),
              weight_g: v.weight_g || 200,
              length_cm: v.length_cm || 10,
              width_cm: v.width_cm || 10,
              height_cm: v.height_cm || 10,
            }))
          });
        }
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

  async findAll(params: { search?: string, brand_id?: number, category_id?: number, series_id?: number, type_code?: any, min_price?: number, max_price?: number, sort?: string }) {
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

    // Dynamic Sort Logic (price sorting handled client-side)
    let orderBy: any = { created_at: 'desc' }; // Default: Newest first (Featured)

    if (sort === 'newest') {
      orderBy = { created_at: 'desc' };
    } else if (sort === 'name') {
      orderBy = { name: 'asc' };
    }
    // Note: price_asc and price_desc are handled in the frontend

    const products = await this.prisma.products.findMany({
      where,
      include: {
        brands: true,
        categories: true,
        series: true,
        product_variants: true,
        product_blindboxes: true,
        product_preorders: true,
        product_promotions: true,
      },
      orderBy
    });

    // [NEW] Apply Dynamic Pricing Logic
    return products.map(product => this.calculatePromotionalPrice(product));
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
          product_variants: true,
          product_blindboxes: true,
          product_preorders: true
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
          product_variants: true,
          product_blindboxes: true,
          product_preorders: true
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
          product_variants: true,
          product_blindboxes: true,
          product_preorders: true,
          product_promotions: true
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
        product_variants: { where: { deleted_at: null } },
        product_blindboxes: true,
        product_preorders: true,
        brands: true,
        categories: true,
        series: true,
        product_promotions: true,
      }
    });
    if (!product) throw new BadRequestException('Product not found');
    
    // [NEW] Apply Dynamic Pricing Logic
    return this.calculatePromotionalPrice(product);
  }

  // [NEW] Helper: Dynamic Pricing Logic
  private calculatePromotionalPrice(product: any) {
    const promo = product.product_promotions;
    const now = new Date();

    // Check if promotion is valid
    const isValidPromo = promo && 
      promo.is_active && 
      new Date(promo.start_date) <= now && 
      new Date(promo.end_date) >= now;

    // Apply to Variants
    if (product.product_variants) {
      product.product_variants = product.product_variants.map((variant: any) => {
        let final_price = Number(variant.price);
        let discount_amount = 0;

        if (isValidPromo) {
          if (promo.type_code === 'PERCENTAGE') {
            discount_amount = final_price * (Number(promo.value) / 100);
            final_price = final_price - discount_amount;
          } else if (promo.type_code === 'FIXED_AMOUNT') {
            discount_amount = Number(promo.value);
            final_price = Math.max(0, final_price - discount_amount);
          }
        }

        return {
          ...variant,
          final_price,
          is_on_sale: isValidPromo,
          discount_percentage: isValidPromo && promo.type_code === 'PERCENTAGE' ? Number(promo.value) : 0,
        };
      });
    }

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
            release_date: new Date(preorder.release_date),
            // Legacy fields removed
          },
          update: {
            release_date: new Date(preorder.release_date),
            // Legacy fields removed
          },
        });

        // Loop through variants and update/create them
        if (variants && variants.length > 0) {
          for (const v of variants) {
            const existingVariant = await tx.product_variants.findUnique({
              where: { sku: v.sku },
            });

            if (existingVariant && existingVariant.product_id !== id) {
              // Skip or throw, but here we proceed
            }

            if (existingVariant) {
              await tx.product_variants.update({
                where: { variant_id: existingVariant.variant_id },
                data: {
                  option_name: v.option_name,
                  price: v.price,
                  deposit_amount: v.deposit_amount, // Update Deposit
                  preorder_slot_limit: v.preorder_slot_limit ?? v.stock_available, // Update Slot Limit
                  barcode: v.barcode,
                  description: v.description,
                  media_assets: v.media_assets ? (v.media_assets as any) : undefined,
                  weight_g: v.weight_g,
                  length_cm: v.length_cm,
                  width_cm: v.width_cm,
                  height_cm: v.height_cm,
                },
              });
            } else {
              await tx.product_variants.create({
                data: {
                  product_id: id,
                  sku: v.sku,
                  option_name: v.option_name,
                  price: v.price,
                  deposit_amount: v.deposit_amount || 0,
                  preorder_slot_limit: v.preorder_slot_limit || v.stock_available || 0,
                  stock_available: 0, // Physical stock 0
                  barcode: v.barcode,
                  description: v.description,
                  media_assets: v.media_assets ? (v.media_assets as any) : JSON.stringify([]),
                  weight_g: v.weight_g || 200,
                  length_cm: v.length_cm || 10,
                  width_cm: v.width_cm || 10,
                  height_cm: v.height_cm || 10,
                },
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

  async generateAiDescription(dto: {
    productName: string;
    variantName?: string;
    userContext?: string;
    imageUrl?: string; // Multimodal Input
  }) {
    if (!process.env.GEMINI_API_KEY) {
      throw new ServiceUnavailableException("AI service is not configured (Missing API Key).");
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const context = dto.userContext ? `User Notes/Context: "${dto.userContext}"` : "User Notes: N/A";
    const variantContext = dto.variantName ? `Target Specific Variant: "${dto.variantName}"` : "Target: Main Product Overview";

    const prompt = `
            Role: Expert Copywriter for Collectibles (Gunpla, Figures, Toys).
            Task: Write a professional, engaging description in Vietnamese.
            
            Product: ${dto.productName}
            ${variantContext}
            ${context}
            
            Guidelines:
            1. **Tone**: Enthusiastic, professional, "Dan choi" friendly.
            2. **Content**: Use the provided User Notes to highlight specific details. If an image is provided, describe the visual details (pose, accessories, color) accurately.
            3. **Format**: Plain text, clear paragraph breaks, 2-3 paragraphs max. Use relevant emojis 🤖✨.
            4. **Hallucination Check**: Only describe features visible in the image or explicitly stated in notes.
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
