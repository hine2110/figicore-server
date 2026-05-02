import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';

@Injectable()
export class InventoryAnalyticsService {
  private readonly logger = new Logger(InventoryAnalyticsService.name);
  private groq: Groq;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    // Khởi tạo Groq AI với API Key từ .env
    const apiKey = this.configService.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      this.logger.error('GROQ_API_KEY is not defined in .env');
      throw new Error('AI Configuration Error: GROQ_API_KEY missing');
    }
    this.groq = new Groq({ apiKey });
  }

  /**
   * Lấy cấu hình OPEX từ Database hoặc dùng mặc định.
   */
  async getOpexConfig() {
    const setting = await this.prisma.system_settings.findUnique({
      where: { key: 'OPEX_CONFIG' }
    });

    if (setting) {
      return setting.value as any;
    }

    // Default OPEX (28%)
    return {
      marketing_pct: 5,
      staff_pct: 10,
      storage_pct: 3,
      risk_pct: 2,
      tax_pct: 8
    };
  }

  /**
   * Bước 2: Truy vấn dữ liệu thật từ cơ sở dữ liệu.
   */
  async getInternalInventoryData() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const opex = await this.getOpexConfig();
    const totalOpexPct = Object.values(opex).reduce((a: any, b: any) => a + b, 0) as number / 100;

    const activeOrderStatuses = ['PROCESSING', 'COMPLETED', 'SHIPPING_TO_WAREHOUSE', 'INSPECTING', 'DEPOSITED'];

    const inventory = await this.prisma.product_variants.findMany({
      where: {
        deleted_at: null,
        products: {
          type_code: 'RETAIL' // CHỈ PHÂN TÍCH HÀNG BÁN LẺ
        }
      },
      include: {
        products: { select: { name: true, type_code: true } },
        product_preorder_configs: { select: { sold_slots: true, total_slots: true } },
        order_items: {
          where: {
            orders: {
              created_at: { gte: thirtyDaysAgo },
              status_code: { in: activeOrderStatuses },
            },
          },
          select: { quantity: true },
        },
      },
    });

    const mappedData = inventory.map((v) => {
      const sales30d = v.order_items.reduce((sum, item) => sum + item.quantity, 0);
      const cost = Number(v.cost_price || 0);
      const retail = Number(v.price || 0);
      const breakEven = cost * (1 + totalOpexPct);
      const liquidate = cost * (1 + (totalOpexPct * 0.2));

      return {
        id: v.variant_id,
        sku: v.sku,
        name: v.products?.name || 'Unknown',
        type: v.products?.type_code || 'RETAIL',
        stock: Number(v.stock_available || 0), // Đảm bảo là số
        retail,
        cost,
        breakEven,
        liquidate,
        sales30d,
        preCount: v.product_preorder_configs?.sold_slots || 0,
      };
    });

    // --- BUSINESS RULE FILTER (Deterministic — AI chỉ xử lý các case đã xác định rõ ràng) ---
    // Mục đích: Không đưa dữ liệu nhập nhằng vào AI để tránh LLM hallucinate kép
    const filteredData = mappedData.filter(item => {
      // RESTOCK candidate: gần hết hàng VÀ có nhu cầu thực (stock <= 15 để có buffer)
      const isLowStock = item.stock <= 15 && item.sales30d > 0;

      // CLEARANCE candidate: tồn kho nhiều VÀ bán rất chậm (sales tuyệt đối thấp)
      // CHỈ CLEARANCE nếu KHÔNG đồng thời là low-stock để tránh conflict
      const isOverstock = item.stock > 20 && item.sales30d > 0 && item.sales30d <= 5 && item.stock > 15;

      // Best-seller đang bán chạy (cần có trong context để AI biết trend)
      const isBestSeller = item.sales30d > 15;

      const isPreorderActive = item.preCount > 0;

      return isLowStock || isOverstock || isBestSeller || isPreorderActive;
    });

    this.logger.log(`Filtered ${filteredData.length} items for AI analysis from ${mappedData.length} total retail items.`);

    return filteredData.sort((a, b) => b.sales30d - a.sales30d || a.id - b.id);
  }

  /**
   * Bước 3: Thu thập dữ liệu xu hướng thị trường giả lập.
   */
  async getExternalMarketTrends(keywords: string[]) {
    if (keywords.length === 0) return [];

    try {
      const completion = await this.groq.chat.completions.create({
        model: this.configService.get<string>('GROQ_MODEL', 'llama3-8b-8192'),
        messages: [
          {
            role: 'system',
            content: `
              You are a market data collection expert in the Collectible Toys & Blindbox industry.
              Task: Simulate search volume change % and market sentiment for the provided list of keywords.
              
              RULES:
              - SearchVolumeChange: Must be a realistic % (e.g., +12%, -5%, +85%).
              - MarketSentiment: Choose only 1 from: "HOT", "STABLE", "VIRAL", "TRENDING", "NEUTRAL", "BEARISH".
              - SuggestedAction: Infer appropriate action (e.g., 'Restock more', 'Maintain niche items', 'Liquidate fast').
              
              RETURN FORMAT (JSON):
              {
                "trends": [
                  { "keyword": string, "searchVolumeChange": string, "marketSentiment": string, "suggestedAction": string }
                ]
              }
            `
          },
          {
            role: 'user',
            content: `List of keywords: [${keywords.join(', ')}]`
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.0, // Chỉnh về 0.0 để dữ liệu ổn định tuyệt đối
        seed: 12345, // Thêm seed để đảm bảo kết quả không đổi nếu input không đổi
      });

      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) throw new Error('Empty Market Data Response');

      const data = JSON.parse(responseText);
      return data.trends || [];
    } catch (error) {
      this.logger.error('Market Simulation Error:', error);
      // Fallback nếu AI lỗi
      return keywords.map(kw => ({
        keyword: kw,
        searchVolumeChange: '0%',
        marketSentiment: 'NEUTRAL',
        suggestedAction: 'Maintain monitoring'
      }));
    }
  }

  /**
   * Bước 4: Phân tích AI tổng hợp — phân loại RESTOCK / CLEARANCE / SKIP cho từng sản phẩm.
   */
  async analyzeWithAI(contextData: any) {
    try {
      const completion = await this.groq.chat.completions.create({
        model: this.configService.get<string>('GROQ_MODEL', 'llama3-8b-8192'),
        messages: [
          {
            role: 'system',
            content: `
You are an autonomous Inventory Decision Engine for FIGICORE, a premium collectible toy and Blind Box retailer.
Your ONLY job: classify each product into EXACTLY ONE outcome — RESTOCK, CLEARANCE, or SKIP. Never assign two outcomes to the same product.

SECTION 1 — DATA FIELD DEFINITIONS
Each item has: i=productId, n=name, s=stock, sl=sales30d, c=cost, b=breakEven, l=liquidateFloor
- breakEven (b): minimum sale price to cover cost + full OPEX. Never discount below this.
- liquidateFloor (l): absolute minimum. Backend will reject any clearance below this automatically.

SECTION 2 — EXCLUSIVE DECISION TREE (apply top-down, one path per item)
STEP 1: Is sl = 0?
  YES -> SKIP. Reason: "No confirmed sales. May be new or stagnant listing."
  NO  -> STEP 2

STEP 2: Is s <= 15 AND sl > 0?
  YES -> RESTOCK. STOP. Do NOT evaluate for clearance.
  NO  -> STEP 3

STEP 3: Is s > 20 AND sl >= 1 AND sl <= 5?
  YES -> CLEARANCE. STOP.
  NO  -> SKIP. Reason: "No significant imbalance detected."

STEP 4 (RESTOCK priority level):
  sl > 15 -> URGENT | sl >= 8 -> HIGH | sl >= 3 -> MEDIUM | sl >= 1 -> LOW

STEP 5 (CLEARANCE discount calculation):
  suggestedDiscount = ceil((1 - b/retailPrice) * 100) + 2 [+2% safety buffer above break-even]
  Max cap: 40%. If even 5% off breaches break-even -> SKIP instead.
  financialNote must state: breakEvenPrice, discount%, and resulting post-discount price.

SECTION 3 — HARD CONFLICT RULES
RULE A: One productId -> one list only. If conflict exists, RESTOCK wins absolutely.
RULE B: sl > 10 = high-demand product. NEVER eligible for clearance regardless of stock.
RULE C: "reason" must cite actual numbers from the data (e.g., "Stock at 8 with 22 sales in 30 days.").
RULE D: Only use productIds (i) from the provided inventory data. Never invent IDs.
RULE E: suggestedDiscount must be a "%" string like "15%". Never a plain number.

SECTION 4 — FEW-SHOT EXAMPLES
[A - RESTOCK urgent]
Item: { i:101, s:8, sl:22, b:1024000 }
Logic: STEP1 sl!=0. STEP2 s=8<=15 AND sl>0 -> RESTOCK. sl=22>15 -> priority=URGENT.
Output in restockList: { productId:101, reason:"Stock critically low at 8 units with 22 sold in 30 days. Stockout imminent.", priority:"URGENT" }

[B - CLEARANCE]
Item: { i:202, s:45, sl:3, b:640000, retailPrice:800000 }
Logic: STEP1 sl!=0. STEP2 s=45>15 NO. STEP3 s=45>20 AND sl=3 in [1-5] -> CLEARANCE.
Discount = ceil((1-640000/800000)*100)+2 = 22%. Under 40% cap.
Output in clearanceList: { productId:202, reason:"45 units idle with only 3 sold in 30 days. Capital locked.", suggestedDiscount:"22%", financialNote:"Break-even 640,000d. At 22% off post-discount is 624,000d — above break-even. Safe." }

[C - SKIP new product]
Item: { i:303, s:30, sl:0 }
Logic: STEP1 sl=0 -> SKIP immediately. No output in either list.

[D - CONFLICT PREVENTION]
Item: { i:404, s:10, sl:20 }
Logic: STEP1 sl!=0. STEP2 s=10<=15 -> RESTOCK. RULE B: sl=20>10 also blocks clearance.
Result: appears ONLY in restockList with priority=URGENT.

SECTION 5 — OUTPUT CONTRACT
Return ONLY valid JSON with exactly these keys. No commentary. No markdown. No extra fields.
{
  "clearanceList": [
    { "productId": <number>, "name": "<string>", "reason": "<cite actual numbers>", "suggestedDiscount": "<N%>", "financialNote": "<calc>" }
  ],
  "restockList": [
    { "productId": <number>, "name": "<string>", "reason": "<cite actual numbers>", "priority": "LOW"|"MEDIUM"|"HIGH"|"URGENT" }
  ],
  "summary": "<2 sentences: total items analyzed, actions recommended, top risk>"
}
Final validation: scan both lists — no productId should appear in both. Remove from clearanceList if conflict.
            `
          },
          {
            role: 'user',
            content: `
FIELD LEGEND: [ i=productId, n=name, s=stock, sl=sales30d, c=cost, b=breakEven, l=liquidateFloor ]

INVENTORY (apply Decision Tree to EACH item independently):
${JSON.stringify(contextData.inventory)}

MARKET TRENDS (qualitative context only — do NOT override the Decision Tree rules):
${JSON.stringify(contextData.market)}

SYSTEM METRICS:
${JSON.stringify(contextData.metrics)}

Analysis Date: ${contextData.analysisDate}

FINAL SELF-CHECK before outputting JSON:
1. Any productId in BOTH clearanceList and restockList? -> Remove from clearanceList.
2. All productIds exist in the inventory data above? -> Remove any that do not.
3. Does each "reason" field cite actual numbers?
            `
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.0,
        seed: 12345,
      });

      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) throw new Error('Empty AI response');

      try {
        const data = JSON.parse(responseText);
        return {
          clearanceList: data.clearanceList || [],
          restockList: data.restockList || [],
          summary: data.summary || 'No summary available'
        };
      } catch (parseError) {
        this.logger.error('Failed to parse AI JSON response:', responseText);
        return { clearanceList: [], restockList: [], summary: 'AI response was malformed.' };
      }
    } catch (error) {
      this.logger.error('Groq AI Analysis Error:', error);
      throw error;
    }
  }

  /**
   * Bước 6: Lấy danh sách đề xuất từ Database cho Frontend.
   */
  async getRecommendations(query: { status?: any; type?: any; page?: string; limit?: string }) {
    const status = query.status || 'PENDING';
    const type = query.type;
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '10');
    const skip = (page - 1) * limit;

    const where = {
      status,
      ...(type && { type }),
    };

    const [total, data] = await Promise.all([
      this.prisma.inventory_recommendations.count({ where }),
      this.prisma.inventory_recommendations.findMany({
        where,
        include: {
          product_variants: {
            select: {
              sku: true,
              stock_available: true,
              price: true,
              cost_price: true,
              products: {
                select: {
                  name: true,
                },
              },
              order_items: {
                where: {
                  orders: {
                    created_at: { gte: new Date(new Date().setDate(new Date().getDate() - 30)) },
                    status_code: { in: ['PROCESSING', 'COMPLETED', 'SHIPPING_TO_WAREHOUSE', 'INSPECTING', 'DEPOSITED'] },
                  },
                },
                select: { quantity: true },
              },
            },
          },
        },
        orderBy: {
          created_at: 'desc',
        },
        skip,
        take: limit,
      })
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Lấy toàn bộ danh sách tồn kho thực tế từ DB
   */
  async getGlobalInventory() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const inventory = await this.prisma.product_variants.findMany({
      where: {
        deleted_at: null,
        products: {
          type_code: 'RETAIL'
        }
      },
      select: {
        variant_id: true,
        sku: true,
        stock_available: true,
        price: true,
        cost_price: true,
        products: {
          select: { name: true }
        },
        order_items: {
          where: {
            orders: {
              created_at: { gte: thirtyDaysAgo },
              status_code: { in: ['PROCESSING', 'COMPLETED', 'SHIPPING_TO_WAREHOUSE', 'INSPECTING', 'DEPOSITED'] },
            },
          },
          select: { quantity: true },
        },
      },
      orderBy: { stock_available: 'asc' }
    });

    return inventory.map(v => ({
      id: v.variant_id,
      name: v.products?.name || 'Unknown',
      sku: v.sku,
      stock: v.stock_available,
      price: Number(v.price || 0),
      cost_price: Number(v.cost_price || 0),
      sales30d: v.order_items.reduce((sum, item) => sum + item.quantity, 0),
    }));
  }

  /**
   * Bước 7: Phê duyệt và thực thi Đề xuất (Actionable AI).
   * Chuyển đổi đề xuất thành Chứng từ (Receipt) hoặc Khuyến mãi (Promotion) thực tế.
   */
  async applyRecommendation(recommendationId: number, userId: number) {
    // 1. Tìm đề xuất và kiểm tra tính hợp lệ
    const recommendation = await this.prisma.inventory_recommendations.findUnique({
      where: { id: recommendationId },
      include: { product_variants: { include: { products: true } } }
    });

    if (!recommendation) throw new Error('Recommendation not found');
    if (recommendation.status !== 'PENDING') throw new Error('This recommendation has already been processed');

    const variantId = recommendation.variant_id;
    const actionValue = recommendation.suggested_action_value || 'NORMAL';

    return await this.prisma.$transaction(async (tx) => {
      // 2. Xử lý theo loại đề xuất
      if (recommendation.type === 'RESTOCK') {
        // Tạo phiếu nhập kho Nháp (Draft Receipt)
        const qty = actionValue === 'URGENT' ? 100 : actionValue === 'HIGH' ? 50 : 20;

        const receipt = await (tx as any).inventory_receipts.create({
          data: {
            note: `[AI Suggestion] Auto-generated restock for ${recommendation.product_variants.products.name}`,
            status_code: 'DRAFT',
            warehouse_staff_id: userId,
          }
        });

        await (tx as any).inventory_receipt_items.create({
          data: {
            receipt_id: receipt.receipt_id,
            variant_id: variantId,
            quantity_total: qty,
            quantity_good: 0,
            quantity_defect: 0,
          }
        });

      } else if (recommendation.type === 'CLEARANCE') {
        // Tạo chương trình giảm giá (Product Promotion)
        const discountPercent = parseInt(actionValue.replace('%', '')) || 10;

        // Bắt đầu Validation Break-even / Liquidation
        const variant = recommendation.product_variants;
        const costPrice = Number(variant.cost_price || 0);
        const originalPrice = Number(variant.price || 0);

        // Tính định mức OPEX (có thể gọi trực tiếp getOpexConfig hoặc hardcode tương đối nếu k gọi được, 
        // nhưng ở đây có context service nên sẽ query lại system_settings thông qua opexConfig)
        const opex = await this.getOpexConfig();
        const totalOpexPct = Object.values(opex).reduce((a: any, b: any) => a + b, 0) as number / 100;
        const liquidatePrice = costPrice * (1 + (totalOpexPct * 0.2));

        const expectedSalePrice = originalPrice * (1 - discountPercent / 100);

        if (expectedSalePrice < liquidatePrice) {
          throw new HttpException('AI suggested price is below liquidation floor. Transaction cancelled!', HttpStatus.BAD_REQUEST);
        }

        const now = new Date();
        const endDate = new Date();
        endDate.setDate(now.getDate() + 7);

        const promotion = await (tx as any).product_promotions.create({
          data: {
            name: `[AI Clearance] ${recommendation.product_variants.products.name}`,
            type_code: 'PERCENTAGE',
            value: discountPercent,
            start_time: '00:00',
            end_time: '23:59',
            is_active: true, // Manager thực thi trực tiếp, không cần duyệt lại
            is_flash_sale: false,
            start_date: now,
            end_date: endDate,
          }
        });

        // Snapshot existing promo and update link
        const currentVariant = await tx.product_variants.findUnique({
          where: { variant_id: variantId },
          select: { product_promotion_id: true }
        });

        await tx.product_variants.update({
          where: { variant_id: variantId },
          data: {
            previous_promotion_id: currentVariant?.product_promotion_id ?? null,
            product_promotion_id: promotion.promotion_id
          }
        });

        // Create promotion_items for storefront logic
        const salePrice = originalPrice * (1 - discountPercent / 100);

        await (tx as any).promotion_items.create({
          data: {
            promotion_id: promotion.promotion_id,
            variant_id: variantId,
            flash_sale_price: salePrice,
            quota: variant.stock_available,
          }
        });
      }

      // 3. Cập nhật trạng thái đề xuất thành APPROVED
      const updatedRecommendation = await (tx as any).inventory_recommendations.update({
        where: { id: recommendationId },
        data: { status: 'APPROVED' }
      });

      return {
        message: `Recommendation ${recommendation.type} applied successfully`,
        data: updatedRecommendation
      };
    });
  }

  /**
   * Bước 5: Lưu trữ đề xuất AI vào Database.
   * Xử lý ghi đè (SUPERSEDED) các đề xuất PENDING cũ của cùng một sản phẩm.
   */
  async saveRecommendations(aiResult: any) {
    const { clearanceList = [], restockList = [] } = aiResult || {};

    // Sử dụng transaction để đảm bảo tính toàn vẹn dữ liệu
    return await this.prisma.$transaction(async (tx) => {
      // 1. Thu thập tất cả variantId liên quan
      const variantIds = [
        ...clearanceList.map((item: any) => item.productId),
        ...restockList.map((item: any) => item.productId),
      ].filter(id => id !== undefined);

      // 2. Đánh dấu TẤT CẢ các đề xuất PENDING cũ là SUPERSEDED (đã bị thay thế)
      // Vì đây là 1 đợt quét toàn diện mới, các đề xuất chưa duyệt từ lần quét trước không còn giá trị
      await (tx as any).inventory_recommendations.updateMany({
        where: {
          status: 'PENDING',
        },
        data: { status: 'SUPERSEDED' },
      });

      // 3. Chuẩn bị dữ liệu lưu mới cho Clearance
      const clearanceRecords = clearanceList.map((item: any) => ({
        variant_id: item.productId,
        type: 'CLEARANCE' as any,
        reason: item.reason,
        suggested_action_value: item.suggestedDiscount,
        financial_note: item.financialNote, // Đọc từ AI response
        status: 'PENDING' as any,
      }));

      // 4. Chuẩn bị dữ liệu lưu mới cho Restock
      const restockRecords = restockList.map((item: any) => ({
        variant_id: item.productId,
        type: 'RESTOCK' as any,
        reason: item.reason,
        suggested_action_value: item.priority,
        financial_note: 'Based on sales velocity and cash flow balance.',
        status: 'PENDING' as any,
      }));

      // 5. Lưu vào Database
      const allRecords = [...clearanceRecords, ...restockRecords];
      if (allRecords.length > 0) {
        await (tx as any).inventory_recommendations.createMany({
          data: allRecords,
        });
      }

      this.logger.log(`Successfully saved ${allRecords.length} AI recommendations to database.`);
    });
  }

  async triggerInventoryCheck(): Promise<any> {
    this.logger.log('Inventory Analytics Job Triggered - AI Analysis starting...');

    try {
      // 1. Thu thập dữ liệu thực tế
      const inventoryData = await this.getInternalInventoryData();

      // --- TỔNG HỢP CHỈ SỐ VĨ MÔ (METRICS AGGREGATION) ---
      const totalVariants = await this.prisma.product_variants.count({ where: { deleted_at: null } });
      const lowStockCount = await this.prisma.product_variants.count({ where: { deleted_at: null, stock_available: { lt: 10 } } });
      const totalInventoryValue = inventoryData.reduce((sum, item) => sum + (item.stock * item.cost), 0);

      const metrics = {
        totalVariantsInSystem: totalVariants,
        currentAnalyzedItems: inventoryData.length,
        lowStockItemsCount: lowStockCount,
        estimatedAnalyzedValue: totalInventoryValue,
      };

      const topKeywords = [...inventoryData]
        .sort((a, b) => b.sales30d - a.sales30d || a.id - b.id)
        .slice(0, 5)
        .map(item => item.name);

      const marketTrends = await this.getExternalMarketTrends(topKeywords);

      // 2. Chạy Phân tích AI
      // Nén dữ liệu inventory trước khi gửi cho AI để tiết kiệm tokens
      const minifiedInventory = inventoryData.map(item => ({
        i: item.id,
        n: item.name.length > 25 ? item.name.substring(0, 25) + '...' : item.name,
        s: item.stock,
        sl: item.sales30d,
        c: item.cost,
        b: item.breakEven,
        l: item.liquidate
      }));

      const aiAnalysis = await this.analyzeWithAI({
        inventory: minifiedInventory,
        market: marketTrends,
        metrics: metrics,
        analysisDate: new Date().toISOString().split('T')[0]
      });

      // 3. VALIDATE AI RESPONSE - Lớp 1: Lọc bỏ các ID bịa đặt (hallucinated)
      const validVariantIds = new Set(inventoryData.map(item => item.id));
      // Tạo lookup map để enforce business rules cứng
      const inventoryMap = new Map(inventoryData.map(item => [item.id, item]));

      const originalClearance = aiAnalysis.clearanceList.length;
      const originalRestock = aiAnalysis.restockList.length;

      // Lọc ID hợp lệ
      aiAnalysis.clearanceList = (aiAnalysis.clearanceList || []).filter((item: any) => {
        const isValid = validVariantIds.has(item.productId);
        if (!isValid) this.logger.warn(`[AI VALIDATION] Removed hallucinated Clearance ID: ${item.productId}`);
        return isValid;
      });

      aiAnalysis.restockList = (aiAnalysis.restockList || []).filter((item: any) => {
        const isValid = validVariantIds.has(item.productId);
        if (!isValid) this.logger.warn(`[AI VALIDATION] Removed hallucinated Restock ID: ${item.productId}`);
        return isValid;
      });

      // 3b. VALIDATE AI RESPONSE - Lớp 2: HARD BUSINESS RULE ENFORCEMENT
      // LLM có thể không tuân thủ nghiêm ngặt điều kiện nghiệp vụ → phải validate lại bằng code
      const restockIds = new Set(aiAnalysis.restockList.map((r: any) => r.productId));

      // Rule 1: RESTOCK chỉ hợp lệ nếu stock <= 15 AND có sales30d > 0
      aiAnalysis.restockList = aiAnalysis.restockList.filter((item: any) => {
        const inv = inventoryMap.get(item.productId);
        if (!inv) return false;
        const pass = inv.stock <= 15 && inv.sales30d > 0;
        if (!pass) this.logger.warn(`[RULE ENFORCE] Rejected RESTOCK for ID ${item.productId}: stock=${inv.stock}, sales=${inv.sales30d}`);
        return pass;
      });

      // Rule 2: CLEARANCE chỉ hợp lệ nếu stock > 20 AND 0 < sales30d <= 5
      // Rule 3: Nếu product đã có trong restockList → TUYỆT ĐỐI không thể clearance (RESTOCK ưu tiên)
      aiAnalysis.clearanceList = aiAnalysis.clearanceList.filter((item: any) => {
        const inv = inventoryMap.get(item.productId);
        if (!inv) return false;

        if (restockIds.has(item.productId)) {
          this.logger.warn(`[RULE ENFORCE] Rejected CLEARANCE for ID ${item.productId}: conflict with RESTOCK (product is low-stock + high-demand)`);
          return false;
        }

        const pass = inv.stock > 20 && inv.sales30d > 0 && inv.sales30d <= 5;
        if (!pass) this.logger.warn(`[RULE ENFORCE] Rejected CLEARANCE for ID ${item.productId}: stock=${inv.stock}, sales=${inv.sales30d} — does not meet clearance criteria`);
        return pass;
      });

      this.logger.log(`[AI VALIDATION L1] Clearance: ${originalClearance} -> ${aiAnalysis.clearanceList.length} | Restock: ${originalRestock} -> ${aiAnalysis.restockList.length}`);

      // 4. LƯU VÀO DATABASE (Bước 5)
      await this.saveRecommendations(aiAnalysis);

      // 5. Log kết quả ra terminal
      console.log('--- [AI ANALYTICS] FINAL DECISION ---');
      console.log('CLEARANCE:', aiAnalysis.clearanceList.length, 'items');
      console.log('RESTOCK:', aiAnalysis.restockList.length, 'items');

      return aiAnalysis;
    } catch (error) {
      this.logger.error('Error in Inventory Analytics:', error);

      // Bắn HTTP Exception để React Query bắt lỗi chính xác
      throw new HttpException(
        'AI Analysis currently unavailable. Please check logs.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Tính toán rủi ro và đề xuất định giá cho sự kiện Blind Box
   * @param minValue Giá trị thấp nhất của sản phẩm trong hộp mù
   * @param maxValue Giá trị cao nhất (Jackpot)
   * @param suggestedTicketPrice (Tùy chọn) Mức giá mà Manager đang muốn thiết lập
   */
  async analyzeBlindboxRisk(minValue: number, maxValue: number, suggestedTicketPrice?: number) {
    // 1. Phân tích tỷ suất OPEX tối thiểu (Break-even threshold)
    const opex = await this.getOpexConfig();
    const totalOpexPct = Object.values(opex).reduce((a: any, b: any) => a + b, 0) as number / 100;

    // 2. Gọi AI để thực thi nghiệp vụ Định lượng tài chính (Actuary Analysis)
    try {
      const completion = await this.groq.chat.completions.create({
        model: this.configService.get<string>('GROQ_MODEL', 'llama3-8b-8192'),
        messages: [
          {
            role: 'system',
            content: `
              You are an Actuary and Risk Manager for "Blind Box" models.
              Task: Calculate Expected Value (EV) and suggest a SAFE ticket price that ensures no loss.
              
              4-Zone Reward Rules:
              - Zone 1 (35% probability): Low value items (Min -> TicketPrice * 0.9)
              - Zone 2 (60% probability): Medium value items (TicketPrice * 0.9 -> TicketPrice * 1.3)
              - Zone 3 (4% probability): High value items (TicketPrice * 1.3 -> Max * 0.9)
              - Zone 4 (1% probability): Jackpot items (Max * 0.9 -> Max)

              Inputs:
              - Min Value: ${minValue}
              - Max Value: ${maxValue}
              - Total OPEX: ${totalOpexPct * 100}% of revenue
              - Suggested Price: ${suggestedTicketPrice || "None"}

              Core Formula: TicketPrice MUST BE GREATER THAN (EV_Rewards + OPEX). Recommended gross profit margin is 7% - 15%.
              
              If a suggested price is provided, validate it. If not, calculate and suggest one.
              
              RETURN FORMAT (JSON):
              {
                "isValid": boolean,
                "expectedCostEV": number,
                "breakEvenPrice": number,
                "suggestedTicketPrice": number,
                "profitMarginExpected": number,
                "rationale": string // Expert explanation of why this pricing is safe.
              }
            `
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1, // Cực kỳ nghiêm ngặt vì là toán học và dòng tiền
      });

      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) throw new Error('Crashed during pricing validation');

      const data = JSON.parse(responseText);
      return data;
    } catch (error) {
      this.logger.error('Blindbox Risk Analysis Error:', error);
      throw new HttpException(
        'Cannot calculate Blind Box risk at this time',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
