import { Injectable, BadRequestException, ServiceUnavailableException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { KiotVietService } from 'src/kiotviet/kiotviet.service';
import { ConfigService } from '@nestjs/config';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Prisma } from '@prisma/client';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class ProductsService {
  private logger = new Logger('ProductsService');
  private groq: OpenAI;
  private genAI: GoogleGenerativeAI;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private kiotvietService: KiotVietService,
  ) {
    const groqKey = this.configService.get<string>('GROQ_API_KEY');
    if (groqKey) {
      this.groq = new OpenAI({
        apiKey: groqKey,
        baseURL: 'https://api.groq.com/openai/v1',
      });
    }

    const geminiKey = this.configService.get<string>('GEMINI_API_KEY') || this.configService.get<string>('GOOGLE_AI_API_KEY');
    if (geminiKey) {
      this.genAI = new GoogleGenerativeAI(geminiKey);
    }
  }

  async visualSearch(base64Image: string) {
    if (!this.groq) {
      throw new ServiceUnavailableException('Dịch vụ phân tích hình ảnh (Groq) hiện chưa được cấu hình.');
    }

    try {
      this.logger.log('--- VISUAL SEARCH START (Llama 4 Scout) ---');
      
      const imageData = base64Image.replace(/^data:image\/\w+;base64,/, '');
      const mimeTypeMatch = base64Image.match(/^data:(image\/\w+);base64,/);
      const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';

      const prompt = `Bạn là chuyên gia về mô hình (figures, gundam, art toys). 
      Hãy phân tích hình ảnh này và trích xuất thông tin để tìm kiếm trong database:
      1. Tên mô hình/sản phẩm (productName): ƯU TIÊN ĐỌC CHỮ TRÊN VỎ HỘP (ví dụ: "Megatron", "Gundam Exia"). Tìm các mã SKU/ID in trên hộp như "CC21", "71173".
      2. Thương hiệu (brand): Ví dụ: Blokees, Bandai, Hasbro.
      3. Dòng sản phẩm (series): Ví dụ: Classic Class, MG, HG.
      4. Màu sắc (color): Màu chủ đạo.

      QUY TẮC:
      - Trả về JSON duy nhất với keys: productName, brand, series, color.
      - CHỈ tập trung vào nhân vật/mẫu vật CHÍNH được xuất hiện trong ảnh. Bỏ qua các nhân vật phụ hoặc tên nhân vật khác xuất hiện trong logo phim/series (ví dụ: Logo "Transformers ONE" có thể có tên nhiều nhân vật, hãy bỏ qua và chỉ lấy tên mẫu vật chính).
      - KHÔNG được bỏ trống productName nếu thấy bất kỳ chữ nào liên quan đến tên sản phẩm trên vỏ hộp.
      - Nếu thấy chữ trên hộp, hãy dùng chính xác chữ đó.`;

      let aiHint: any = {};
      let results: any[] = [];
      let isExactMatch = false;
      let finalSearchTerm = '';
      let attempts = 0;
      const maxAttempts = 2; // Allow up to 2 attempts with refined prompts

      while (attempts < maxAttempts && results.length === 0) {
        attempts++;
        this.logger.log(`Visual Search Attempt ${attempts}...`);

        const dynamicPrompt = attempts === 1 
          ? prompt 
          : `${prompt}\n\nGHI CHÚ: Lần tìm kiếm trước không có kết quả. Hãy nhìn THẬT KỸ các chữ nhỏ nhất trên hộp, các mã số (như CC, SP, No.), hoặc các ký tự đặc biệt có thể định danh SKU sản phẩm.`;

        // -- STEP 1: AI Analysis (Llama 4 -> Gemini Fallback) --
        try {
          const response = await this.groq.chat.completions.create({
            model: 'meta-llama/llama-4-scout-17b-16e-instruct',
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: dynamicPrompt },
                { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageData}` } }
              ]
            }],
            response_format: { type: 'json_object' }
          });
          aiHint = JSON.parse(response.choices[0].message.content || '{}');
          this.logger.log(`Attempt ${attempts} - Llama 4 Hint: ${JSON.stringify(aiHint)}`);
        } catch (e) {
          this.logger.warn(`Llama 4 failed on attempt ${attempts}: ${e.message}`);
        }

        if ((!aiHint.productName && !aiHint.brand) && this.genAI) {
          this.logger.log(`Attempt ${attempts} - Llama failed keywords, trying Gemini Lite...`);
          try {
            const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite-001' });
            const result = await model.generateContent([
              dynamicPrompt + " (Respond in raw JSON)",
              { inlineData: { data: imageData, mimeType: mimeType } }
            ]);
            const text = (await result.response).text().replace(/```json/g, '').replace(/```/g, '').trim();
            aiHint = JSON.parse(text);
            this.logger.log(`Attempt ${attempts} - Gemini Hint: ${JSON.stringify(aiHint)}`);
          } catch (e) {
            this.logger.warn(`Gemini failed on attempt ${attempts}: ${e.message}`);
          }
        }

        // -- STEP 2: Database Searching (4 Layers) --
        if (aiHint.productName || aiHint.brand || aiHint.series) {
          const searchTerms = [aiHint.series, aiHint.productName, aiHint.brand].filter(Boolean).join(' ');
          finalSearchTerm = searchTerms;

          // Layer 1: Strict (AND + Color)
          results = await this.findAll({ search: searchTerms, color: aiHint.color });
          
          if (results.length > 0) {
            isExactMatch = true;
          } else {
            // Layer 2: Strict (AND only)
            if (aiHint.color) {
              results = await this.findAll({ search: searchTerms });
            }

            // Layer 3: Broad (OR Tên/Dòng)
            if (results.length === 0 && (aiHint.productName || aiHint.series)) {
              finalSearchTerm = [aiHint.productName, aiHint.series].filter(Boolean).join(' ');
              results = await this.findAll({ search: finalSearchTerm, searchMode: 'OR' });
            }

            // Layer 4: Minimal (Series/Brand)
            if (results.length === 0 && (aiHint.brand || aiHint.series)) {
              finalSearchTerm = aiHint.series || aiHint.brand;
              results = await this.findAll({ search: finalSearchTerm, searchMode: 'OR' });
            }
          }

          // -- STEP 3: Relevance Sorting & Filtering (Custom Ranking) --
          if (results.length > 1) {
            const keywords = finalSearchTerm.toLowerCase().split(/\s+/).filter(k => k.length > 1);
            
            // Map results to their scores for filtering
            const scoredResults = results.map(p => {
              const name = p.name.toLowerCase();
              const brandName = p.brands?.name?.toLowerCase() || '';
              const seriesName = p.series?.name?.toLowerCase() || '';
              
              const keywordScore = keywords.reduce((acc, kw) => 
                acc + (name.includes(kw) || brandName.includes(kw) || seriesName.includes(kw) ? 1 : 0), 0);
              
              // Extra weight for SKU matches
              const skuScore = p.product_variants?.some((v: any) => 
                keywords.some(kw => v.sku.toLowerCase().includes(kw))) ? 2 : 0;
              
              return { product: p, score: keywordScore + skuScore };
            });

            // Sort by score descending
            scoredResults.sort((a, b) => b.score - a.score);

            const maxScore = scoredResults[0].score;
            
            // Filtering: Keep only results with high relevance relative to the top match
            // If top matches are weak (score < 2), be very strict.
            // If top matches are strong, allow some variation but filter out low scores.
            results = scoredResults
              .filter(item => {
                if (maxScore >= 5) return item.score >= maxScore * 0.8; // Strong matches: keep very close ones
                if (maxScore >= 3) return item.score >= maxScore * 0.6; // Mid matches
                return item.score >= maxScore; // Weak matches: only keep the best ones
              })
              .map(item => item.product);

            // Cap results to avoid overwhelming the user with noise
            if (results.length > 5 && !isExactMatch) {
              results = results.slice(0, 5);
            }
          }
        }

        if (results.length > 0) {
          this.logger.log(`Success on Attempt ${attempts}! Found ${results.length} products.`);
        } else {
          this.logger.warn(`Attempt ${attempts} yielded no results.`);
        }
      }

      return {
        products: results,
        metadata: {
          isExactMatch,
          searchTerm: finalSearchTerm,
          aiHint,
          analysisAttempts: attempts
        }
      };
    } catch (error) {
      this.logger.error(`Visual search critical error: ${error.message}`, error.stack);
      throw error;
    }
  }


  async create(createProductDto: CreateProductDto) {
    let {
      variants,
      blindbox,
      preorder,
      ...productData
    } = createProductDto;

    // --- FIX: FORCE CLEAR VARIANTS FOR BLINDBOX ---
    // This prevents the Retail loop from creating a "Ghost Variant" with 0 stock.
    if (productData.type_code === 'BLINDBOX') {
      variants = [];
    }
    // ----------------------------------------------

    // Helper: Generate SKU/Barcode
    const genCode = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const product = await this.prisma.$transaction(async (tx) => {
      // 1. Create Parent Product
      const parentProduct = await tx.products.create({
        data: {
          name: productData.name,
          type_code: productData.type_code,
          brand_id: productData.brand_id,
          category_id: productData.category_id,
          series_id: productData.series_id,
          description: productData.description,
          media_urls: productData.media_urls ? (productData.media_urls as any) : Prisma.JsonNull,
          status_code: productData.status_code || 'ACTIVE',
        },
      });

      // 2. Process Variants
      if (variants && variants.length > 0) {
        for (const variantDto of variants) {
          const isPreorder = productData.type_code === 'PREORDER';

          const variantData: any = {
            product_id: parentProduct.product_id,
            option_name: variantDto.option_name,
            sku: variantDto.sku || genCode('SKU'),
            barcode: variantDto.barcode || genCode('BAR'),
            media_assets: variantDto.media_assets ? (variantDto.media_assets as any) : JSON.stringify([]),
            description: variantDto.description,
            weight_g: variantDto.weight_g || 200,
            length_cm: variantDto.length_cm || 10,
            width_cm: variantDto.width_cm || 10,
            height_cm: variantDto.height_cm || 10,
            scale: variantDto.scale,
            material: variantDto.material,
            included_items: variantDto.included_items ? (variantDto.included_items as any) : undefined,
            price: isPreorder ? 0 : variantDto.price,
            stock_available: isPreorder ? 0 : (variantDto.stock_available ?? 0),
            stock_defect: variantDto.stock_defect ?? 0,
            tax_rate: (productData.type_code === 'RETAIL' || productData.type_code === 'AUCTION') ? 1 : 0,
          };

          const createdVariant = await tx.product_variants.create({ data: variantData });

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
              },
            });
          }
        }
      }

      // Handle Blindbox extension
      if (productData.type_code === 'BLINDBOX' && blindbox) {
        const price = Number(blindbox.price);
        await tx.product_variants.create({
          data: {
            product_id: parentProduct.product_id,
            sku: genCode('BBOX'),
            barcode: genCode('BAR'),
            option_name: 'Blindbox Ticket',
            price: price,
            media_assets: JSON.stringify([]),
            stock_available: 999999,
            stock_defect: 0,
            weight_g: 200, length_cm: 10, width_cm: 10, height_cm: 10
          }
        });
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
            product_id: parentProduct.product_id,
            price: blindbox.price,
            min_value: blindbox.min_value_allow,
            max_value: blindbox.max_value_allow,
            tier_config: JSON.stringify(tiers) as any
          }
        });
      }

      return parentProduct;
    });

    // 4. KiotViet Push Logic (Retail Only)
    if (createProductDto.type_code === 'RETAIL') {
      try {
        const createdProduct = await this.prisma.products.findUnique({
          where: { product_id: product.product_id },
          include: {
            product_variants: true,
            categories: true,
            brands: true
          }
        });

        if (createdProduct) {
          for (const variant of createdProduct.product_variants) {
            try {
              await this.kiotvietService.createProductOnKiotViet({
                name: createdProduct.name,
                sku: variant.sku,
                price: Number(variant.price),
                categoryName: createdProduct.categories?.name || 'Chưa phân loại',
                images: Array.isArray(createdProduct.media_urls) ? (createdProduct.media_urls as string[]) : [],
                weight: variant.weight_g || 200
              });
            } catch (kvError) {
              Logger.error(`KiotViet push failed for SKU ${variant.sku}: ${kvError.message}`);
            }
          }
        }
      } catch (pushError) {
        Logger.error(`KiotViet critical push error: ${pushError.message}`);
      }
    }

    return product;
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

  async findAll(params: { search?: string, color?: string, brand_id?: number, category_id?: number, series_id?: number, type_code?: any, min_price?: number, max_price?: number, sort?: string, searchMode?: 'AND' | 'OR' }) {
    const { search, color, brand_id, category_id, series_id, type_code, min_price, max_price, sort, searchMode = 'AND' } = params;

    const where: Prisma.productsWhereInput = {
      AND: [
        // 1. Exact Filters
        type_code ? { type_code: type_code } : {},
        brand_id ? { brand_id: Number(brand_id) } : {},
        category_id ? { category_id: Number(category_id) } : {},
        series_id ? { series_id: Number(series_id) } : {},

        // 2. Search Logic (Split words into multiple AND/OR contains for flexibility)
        search ? {
          [searchMode]: search.split(/\s+/).filter(word => word.length > 1).map(word => ({
            OR: [
              { name: { contains: word, mode: 'insensitive' } },
              { product_variants: { some: { sku: { contains: word, mode: 'insensitive' } } } },
              { product_variants: { some: { option_name: { contains: word, mode: 'insensitive' } } } },
              { brands: { name: { contains: word, mode: 'insensitive' } } },
              { series: { name: { contains: word, mode: 'insensitive' } } }
            ]
          }))
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
        } : {},

        // 4. Color Filter (Multiple colors fallback)
        color ? {
          OR: color.split(/[\s,]+/).filter(c => c.length > 1).map(c => ({
            OR: [
              { name: { contains: c, mode: 'insensitive' } },
              { product_variants: { some: { option_name: { contains: c, mode: 'insensitive' } } } }
            ]
          }))
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
        product_variants: {
          include: {
            product_preorder_configs: true
          }
        },
        product_blindboxes: true,
        product_promotions: true,
      },
      orderBy
    });

    // [NEW] Apply Dynamic Pricing Logic
    return products.map(product => this.calculatePromotionalPrice(product));
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
            tax_rate: Number(variant.tax_rate || 0), // Include tax_rate for POS
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
          product_variants: true,
          product_blindboxes: true,
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
        product_variants: {
          where: { deleted_at: null },
          include: { product_preorder_configs: true }
        },
        product_blindboxes: true,
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

      if ((type === 'RETAIL' || type === 'AUCTION') && variants && variants.length > 0) {
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
    if (!this.genAI) {
      throw new ServiceUnavailableException("AI service is not configured (Missing API Key).");
    }

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
          this.logger.warn(`Failed to fetch AI Image: ${dto.imageUrl}`);
        }
      } catch (imgErr) {
        this.logger.error("AI Image Fetch Error in generateAiDescription", imgErr);
      }
    }

    // GENERATION LOGIC WITH FALLBACK
    try {
      try {
        // Attempt 1: Gemini 2.0 Flash
        const model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const result = await model.generateContent(parts);
        const response = await result.response;
        return { text: response.text() };
      } catch (primaryError) {
        this.logger.warn(`Primary Model (gemini-2.0-flash) failed: ${primaryError.message}. Retrying with Lite...`);

        // Attempt 2: Fallback to Lite
        const model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite-001" });
        const result = await model.generateContent(parts);
        const response = await result.response;
        return { text: response.text() };
      }
    } catch (finalError) {
      this.logger.error("AI Gen Failed (All Models)", finalError);
      throw new ServiceUnavailableException("Dịch vụ AI hiện không khả dụng. Vui lòng thử lại sau.");
    }
  }

  // --- BLINDBOX TIER ALGORITHM ---
  generateBlindboxTiers(price: number, min: number, max: number) {
    // 1. Tier 1 (Common - 75%)
    // Range: [Min, Price]
    const tier1 = {
      name: 'Common',
      probability: 75,
      value_min: min,
      value_max: price
    };

    // 2. Tier 2 (Rare - 20%)
    // Range: [Price + 1, Price + (Max - Price) * 0.4]
    const tier2Max = Math.floor(price + (max - price) * 0.4);
    const tier2 = {
      name: 'Rare',
      probability: 20,
      value_min: price + 1,
      value_max: tier2Max
    };

    // 3. Tier 3 (Legendary - 5%)
    // Range: [End of Tier 2 + 1, Max]
    const tier3 = {
      name: 'Legendary',
      probability: 5,
      value_min: tier2Max + 1,
      value_max: max
    };

    return [tier1, tier2, tier3];
  }
}