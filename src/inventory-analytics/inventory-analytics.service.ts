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

    const activeOrderStatuses = [
      'PROCESSING',
      'COMPLETED',
      'SHIPPING_TO_WAREHOUSE',
      'INSPECTING',
      'DEPOSITED'
    ];

    const inventory = await this.prisma.product_variants.findMany({
      where: { deleted_at: null },
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

    return inventory.map((v) => {
      const salesLast30Days = v.order_items.reduce((sum, item) => sum + item.quantity, 0);
      
      // Retail Pricing Logic
      const costPrice = Number(v.cost_price || 0);
      const retailPrice = Number(v.price || 0);
      const breakEvenPrice = costPrice * (1 + totalOpexPct);
      const liquidatePrice = costPrice * (1 + (totalOpexPct * 0.2));

      return {
        variantId: v.variant_id,
        sku: v.sku,
        productName: v.products?.name || 'Unknown',
        productType: v.products?.type_code || 'RETAIL',
        currentStock: v.stock_available,
        retailPrice,
        costPrice,
        breakEvenPrice,
        liquidatePrice,
        salesLast30Days,
        preorderCount: v.product_preorder_configs?.sold_slots || 0,
      };
    });
  }

  /**
   * Bước 3: Thu thập dữ liệu xu hướng thị trường giả lập.
   */
  async getExternalMarketTrends(keywords: string[]) {
    if (keywords.length === 0) return [];
    
    try {
      const completion = await this.groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
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
        temperature: 0.7, // Cho phép một chút biến động để dữ liệu sinh động
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
   * Bước 4: Tích hợp AI (Gemini) để phân tích dữ liệu tổng hợp.
   */
  async analyzeWithAI(contextData: any) {
    try {
      const completion = await this.groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: `
              You are a leading supply chain analyst in the collectible toy and Blindbox industry.
              Task: Based on internal inventory data and external market trends, provide recommendations for restocking and clearance.
              
              ANALYSIS RULES & FINANCIAL CONSTRAINTS:
              1. Clearance: 
                 - Conditions: High inventory (>50), low 30-day sales, and NEUTRAL/BEARISH market sentiment.
                 - PRICING RULE: "suggestedDiscount" must be calculated so that the post-discount price is NOT lower than [breakEvenPrice].
                 - EXCEPTION: Only when a product has been in stock for too long and the market is extremely bad can it be reduced to the [liquidatePrice] (stop-loss floor). NEVER go below [liquidatePrice].
              
              2. Restock: 
                 - Conditions: Low stock (<20) OR (high 30-day sales AND HOT/VIRAL market sentiment).
                 - SMART RULES: 
                    * If current stock > 50, NEVER use the phrase "Low stock".
                    * If stock is already > 100 and the market is HOT, only suggest MEDIUM priority (not URGENT).
                    * AI must compare 30-day sales with current stock to calculate "coverage" (e.g., stock of 100 with 50 sales/month is safe, no urgent restock needed).
                 - Priority Level: Based on sales velocity and actual trends.
      
              RETURN FORMAT (JSON):
              {
                "clearanceList": [
                  { 
                    "productId": number, 
                    "name": "string", 
                    "reason": "string", 
                    "suggestedDiscount": "string", 
                    "financialNote": "Calculation description based on Break-even" 
                  }
                ],
                "restockList": [
                  { "productId": number, "name": "string", "reason": "string", "priority": "LOW" | "MEDIUM" | "HIGH" | "URGENT" }
                ]
              }
            `
          },
          {
            role: 'user',
            content: `INPUT DATA (JSON):\n${JSON.stringify(contextData)}`
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1, // Tuyệt đối ổn định
      });

      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) throw new Error('Empty AI response');

      return JSON.parse(responseText);
    } catch (error) {
      this.logger.error('Groq AI Analysis Error:', error);
      throw error;
    }
  }

  /**
   * Bước 6: Lấy danh sách đề xuất từ Database cho Frontend.
   */
  async getRecommendations(query: { status?: any; type?: any }) {
    const { status, type } = query;

    return await this.prisma.inventory_recommendations.findMany({
      where: {
        status: status || 'PENDING', // Mặc định chỉ lấy các đề xuất mới nhất chưa xử lý
        ...(type && { type }),      // Lọc theo CLEARANCE hoặc RESTOCK nếu có
      },
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
        created_at: 'desc', // Phân tích mới nhất lên đầu
      },
    });
  }

  /**
   * Lấy toàn bộ danh sách tồn kho thực tế từ DB
   */
  async getGlobalInventory() {
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
        products: {
          select: { name: true }
        }
      },
      orderBy: { stock_available: 'asc' } // Ưu tiên hiện hàng sắp hết lên trước
    });

    return inventory.map(v => ({
      id: v.variant_id,
      name: v.products?.name || 'Unknown',
      sku: v.sku,
      stock: v.stock_available
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
        success: true,
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
    const { clearanceList, restockList } = aiResult;

    // Sử dụng transaction để đảm bảo tính toàn vẹn dữ liệu
    return await this.prisma.$transaction(async (tx) => {
      // 1. Thu thập tất cả variantId liên quan
      const variantIds = [
        ...clearanceList.map((item: any) => item.productId),
        ...restockList.map((item: any) => item.productId),
      ];

      // 2. Đánh dấu các đề xuất PENDING cũ là SUPERSEDED (đã bị thay thế)
      if (variantIds.length > 0) {
        await (tx as any).inventory_recommendations.updateMany({
          where: {
            variant_id: { in: variantIds },
            status: 'PENDING',
          },
          data: { status: 'SUPERSEDED' },
        });
      }

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
      const topKeywords = inventoryData
        .sort((a, b) => b.salesLast30Days - a.salesLast30Days)
        .slice(0, 3)
        .map(item => item.productName);
      const marketTrends = await this.getExternalMarketTrends(topKeywords);

      // 2. Chạy Phân tích AI
      const aiAnalysis = await this.analyzeWithAI({
        inventory: inventoryData,
        market: marketTrends,
        analysisDate: new Date().toISOString()
      });

      // 3. LƯU VÀO DATABASE (Bước 5)
      await this.saveRecommendations(aiAnalysis);

      // 4. Log kết quả ra terminal
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
        model: 'llama-3.3-70b-versatile',
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
