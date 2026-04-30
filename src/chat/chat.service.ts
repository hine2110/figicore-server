import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';

@Injectable()
export class ChatService {
  private openai: OpenAI;
  private logger = new Logger('ChatService');

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private productsService: ProductsService,
  ) {
    const apiKey = this.configService.get<string>('GROQ_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({
        apiKey: apiKey,
        baseURL: 'https://api.groq.com/openai/v1',
      });
    } else {
      this.logger.error('GROQ_API_KEY is not defined in environment variables');
    }
  }

  async getAiResponse(message: string, history: { role: 'user' | 'model'; parts: string }[]) {
    if (!this.openai) {
      return 'Xin lỗi, dịch vụ AI hiện không khả dụng. Vui lòng thử lại sau.';
    }

    try {
      // ===================================================================
      // STEP 1: INTELLIGENT INTENT DETECTION
      // ===================================================================
      const msgLower = message.toLowerCase().trim();

      // Price extraction (supports "500k", "1 triệu", "1.5tr")
      const priceKMatch = message.match(/(\d+(?:[.,]\d+)?)\s*k\b/i);
      const priceTrMatch = message.match(/(\d+(?:[.,]\d+)?)\s*tr(?:iệu)?/i);
      const underMatch = /\b(dưới|không quá|tầm|tối đa)\b/.test(msgLower);
      const overMatch = /\b(trên|từ|hơn)\b/.test(msgLower);

      let priceVal: number | null = null;
      if (priceKMatch) priceVal = parseFloat(priceKMatch[1].replace(',', '.')) * 1000;
      else if (priceTrMatch) priceVal = parseFloat(priceTrMatch[1].replace(',', '.')) * 1000000;

      // Intent flags
      const isCheap = /\b(rẻ|giá rẻ|rẻ nhất|giá thấp|tiết kiệm|budget|affordable)\b/.test(msgLower);
      const isNew = /\b(mới|mới nhất|vừa ra|hot nhất|mới về)\b/.test(msgLower);
      const isList = /\b(liệt kê|tất cả|danh sách)\b/.test(msgLower);
      const inStockOnly = /\b(có sẵn|còn hàng|in stock|available|mua ngay)\b/.test(msgLower);
      const isOrderQuery = /\b(đơn hàng|đơn của|mã đơn|trạng thái đơn|theo dõi)\b/.test(msgLower);
      const isKnowledgeQuery = /\b(là gì|khác nhau|so sánh|giải thích|hướng dẫn|cách|tại sao|nên mua)\b/.test(msgLower);
      const isGreeting = /^(chào|hi|hello|hey|xin chào|alo)\b/i.test(msgLower);
      const isVague = msgLower.length < 20 && !priceVal && !isCheap && !isNew;

      // Product type filter
      let typeFilter: string | null = null;
      if (/\b(preorder|đặt trước|pre-order)\b/.test(msgLower)) typeFilter = 'PREORDER';
      else if (/\b(đấu giá|auction)\b/.test(msgLower)) typeFilter = 'AUCTION';
      else if (/\b(blindbox|hộp mù|blind box)\b/.test(msgLower)) typeFilter = 'BLINDBOX';

      // Keyword extraction
      const gradeMatch = msgLower.match(/\b(hg|mg|rg|pg|sd|shf|figma|nendoroid)\b/);
      const brandKeywords = ['gundam', 'gunpla', 'figure', 'mô hình', 'hot toys', 'bandai', 'gsc'];
      const brandMatch = brandKeywords.find(k => msgLower.includes(k));

      // Build search params
      const searchParams: any = { status_code: 'ACTIVE' };
      if (isNew) searchParams.sort = 'newest';
      if (gradeMatch) searchParams.search = gradeMatch[1];
      else if (brandMatch) searchParams.search = brandMatch;
      if (typeFilter) searchParams.type_code = typeFilter;
      if (priceVal) {
        if (underMatch) { searchParams.max_price = priceVal; }
        else if (overMatch) { searchParams.min_price = priceVal; }
        else {
          // "tầm 500k" = range ±40% around target
          searchParams.min_price = Math.round(priceVal * 0.6);
          searchParams.max_price = Math.round(priceVal * 1.4);
        }
      }

      // ===================================================================
      // STEP 2: FETCH PRODUCTS FROM DB
      // ===================================================================
      const isConversationalOnly = isGreeting || isKnowledgeQuery || isVague;
      let displayProducts: any[] = [];
      let isFallback = false;

      if (!isConversationalOnly) {
        let result = await this.productsService.findAll(searchParams) as any;
        let products = result?.data || result || [];

        // ✅ HARD FILTER: chỉ lấy sản phẩm ACTIVE — findAll không nhận status_code
        products = products.filter((p: any) => p.status_code === 'ACTIVE');

        // Strict whitelist filter for cheap queries — never show AUCTION or PREORDER
        if (isCheap) {
          products = products.filter((p: any) =>
            p.type_code === 'RETAIL' || p.type_code === 'BLINDBOX'
          );
          products.sort((a: any, b: any) => {
            const pa = Number(a.product_variants?.[0]?.price || 99999999);
            const pb = Number(b.product_variants?.[0]?.price || 99999999);
            return pa - pb;
          });
        }

        // When no explicit type requested, prefer RETAIL first (deprioritize PREORDER/AUCTION)
        if (!typeFilter && !isCheap) {
          products.sort((a: any, b: any) => {
            const typeOrder = { 'RETAIL': 0, 'BLINDBOX': 1, 'PREORDER': 2, 'AUCTION': 3 };
            return (typeOrder[a.type_code] ?? 4) - (typeOrder[b.type_code] ?? 4);
          });
        }

        // Filter out-of-stock products if user explicitly asks for available items
        if (inStockOnly) {
          products = products.filter((p: any) => {
            const stock = p.product_variants?.[0]?.stock_available ?? 1;
            return Number(stock) > 0;
          });
        }

        const maxProducts = isList ? 8 : 3;
        displayProducts = products.slice(0, maxProducts);

        // Fallback ONLY when no specific type filter — avoid cross-type confusion
        if (displayProducts.length === 0 && !typeFilter) {
          const fbResult = await this.productsService.findAll({ sort: 'newest' } as any) as any;
          let fb = fbResult?.data || fbResult || [];
          fb = fb.filter((p: any) => p.status_code === 'ACTIVE');
          if (isCheap) fb = fb.filter((p: any) => p.type_code === 'RETAIL' || p.type_code === 'BLINDBOX');
          displayProducts = fb.slice(0, 2);
          isFallback = true;
        }
        // If typeFilter active but no results — stay empty (no cross-type fallback)
      }

      // ===================================================================
      // STEP 3: BUILD RICH PRODUCT CONTEXT
      // ===================================================================
      const formatPrice = (price: any) => {
        if (!price || Number(price) <= 0) return 'Liên hệ';
        return new Intl.NumberFormat('vi-VN').format(Number(price)) + 'đ';
      };

      const resolveUrl = (url: string) => {
        if (!url) return '';
        if (url.startsWith('http')) return url;
        const base = (this.configService.get<string>('BASE_URL') || 'https://api.figicore.com')
          .replace(/\/api$/, '').replace(/\/$/, '');
        return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
      };

      const extractImage = (p: any): string => {
        if (p.thumbnail) {
          const t = typeof p.thumbnail === 'string' ? p.thumbnail : (p.thumbnail?.url || '');
          if (t) return resolveUrl(t);
        }
        if (p.media_urls) {
          try {
            const m = typeof p.media_urls === 'string' ? JSON.parse(p.media_urls) : p.media_urls;
            const arr = Array.isArray(m) ? m : (m.images || []);
            if (arr.length > 0) return resolveUrl(typeof arr[0] === 'string' ? arr[0] : arr[0]?.url || '');
          } catch { }
        }
        if (p.product_variants?.[0]?.media_assets) {
          try {
            const vm = p.product_variants[0].media_assets;
            const assets = typeof vm === 'string' ? JSON.parse(vm) : vm;
            if (Array.isArray(assets) && assets.length > 0)
              return resolveUrl(typeof assets[0] === 'string' ? assets[0] : assets[0]?.url || '');
          } catch { }
        }
        return '';
      };

      let productContextStr: string;
      if (isConversationalOnly) {
        productContextStr = '[ĐÂY LÀ CÂU HỎI HỘI THOẠI — Hỏi lại 1 câu để hiểu nhu cầu. KHÔNG liệt kê sản phẩm.]';
      } else if (displayProducts.length === 0) {
        const noResultMsg = typeFilter
          ? `[HỀ THỐNG XÁC NHẬN: Tổng sản phẩm ${typeFilter} ACTIVE = 0. KHÔNG ĐƯỢC tự bọa tên sản phẩm. Hãy nói thẳng hiện nay nền tảng chưa có sản phẩm ${typeFilter} nào đang mở.]`
          : '[KHÔNG CÓ SẢN PHẨM PHÙ HỢP — Báo khách hết hàng và gợi ý danh mục khác.]';
        productContextStr = noResultMsg;
      } else {
        const prefix = isFallback
          ? `[GỢI Ý DỰ PHÒNG — Có ĐÚNG ${displayProducts.length} sản phẩm dưới đây. LIỆT KÊ ĐÚNG ${displayProducts.length} CÁI, KHÔNG THÊM]\n`
          : `[DB TRẢ VỀ ĐÚNG ${displayProducts.length} SẢN PHẨM. LIỆT KÊ ĐÚNG ${displayProducts.length} CÁI DƯỚI ĐÂY, KHÔNG TỰ Ý SINH THÊM]\n`;

        productContextStr = prefix + displayProducts.map(p => {
          const img = extractImage(p);
          const imgMd = img ? `![${p.name}](${img})` : '';
          const variant = p.product_variants?.[0] ?? p.variants?.[0];
          const preorderConfig = variant?.product_preorder_configs;

          let priceDisplay: string;
          if (p.type_code === 'PREORDER' && preorderConfig) {
            const deposit = preorderConfig.deposit_amount;
            const full = preorderConfig.full_price;
            if (deposit && full) {
              priceDisplay = `Cọc: ${formatPrice(deposit)} / Full: ${formatPrice(full)}`;
            } else if (full) {
              priceDisplay = `Full: ${formatPrice(full)}`;
            } else if (deposit) {
              priceDisplay = `Cọc từ: ${formatPrice(deposit)}`;
            } else {
              priceDisplay = 'Liên hệ';
            }
          } else {
            priceDisplay = formatPrice(variant?.price);
          }

          return `• ${imgMd} **${p.name}** (${p.type_code}) | Giá: ${priceDisplay} | [Xem chi tiết](/customer/product/${p.product_id})`;
        }).join('\n');
      }

      // ===================================================================
      // STEP 4: ORDER LOOKUP
      // ===================================================================
      let orderContext = '';
      if (isOrderQuery) {
        const codeMatch = message.match(/\b([A-Z]{2,}-\d{4,}|FGC[A-Z0-9]{5,})\b/);
        if (codeMatch) {
          const order = await this.prisma.orders.findUnique({
            where: { order_code: codeMatch[0] },
            include: { order_items: { include: { product_variants: { include: { products: true } } } } }
          });
          if (order) {
            const items = order.order_items.map(i => i.product_variants.products.name).join(', ');
            orderContext = `\n[ĐƠN HÀNG ${codeMatch[0]}] Trạng thái: ${order.status_code} | Tổng: ${formatPrice(order.total_amount)} | SP: ${items} | Ngày: ${order.created_at?.toLocaleDateString('vi-VN')}`;
          } else {
            orderContext = `\n[ĐƠN HÀNG] Không tìm thấy đơn mã "${codeMatch[0]}".`;
          }
        }
      }

      // ===================================================================
      // STEP 5: EXPERT SYSTEM PROMPT WITH FEW-SHOT EXAMPLES
      // ===================================================================
      const systemPrompt = `Bạn là "FigiCore Specialist" — nhân viên tư vấn bán hàng chuyên nghiệp tại shop mô hình FigiCore. Mục tiêu: thay thế hoàn toàn 1 nhân viên tư vấn thực sự.

## PHONG CÁCH
Xưng "mình", gọi "bạn". Thân thiện, đúng trọng tâm. KHÔNG tiết lộ là AI. Câu trả lời ngắn gọn, tối đa 4 câu + sản phẩm.

## KIẾN THỨC NGHIỆP VỤ
- **BLINDBOX**: Hộp bí ẩn, không biết nhân vật trước khi mở. Điểm bán = cảm giác hồi hộp.
- **PREORDER**: Đặt cọc giữ chỗ hàng chưa về. Giá hiển thị là "Cọc: Xđ / Full: Yđ" (không phải 0đ).
- **AUCTION**: Đấu giá Livestream, giá tăng dần theo bid. KHÔNG phải hàng bán lẻ thông thường.
- **Gunpla**: SD < HG (1/144) < RG (1/144, khung nội) < MG (1/100) < PG (1/60, đỉnh cao).
- **Figure**: Scale Figure (tĩnh, trưng bày) | Nendoroid (chibi, đổi pose) | SHF/Figma (khớp, tạo dáng).

## HƯỠNG DẪN Sử DỤNG HỆ THỐNG FIGICORE (QUAN TRỌNG)
Khi khách hỏi cách mua/đặt hàng, hướng dẫn đúng luồng thực tế của FigiCore:

**Luồng mua hàng RETAIL/BLINDBOX:**
1. Vào [Cửa hàng](/customer/shop) → Chọn sản phẩm → Thêm vào giỏ hàng
2. Kiểm tra giỏ hàng → Chọn địa chỉ giao → Chọn phương thức thanh toán
3. Thanh toán (Ví FigiCore, COD, chuyển khoản) → Xác nhận đơn

**Luồng đặt hàng PREORDER (ĐẶT CỌC):**
1. Vào [Pre-order Shop](/customer/preorder) → Chọn sản phẩm → Xem giá cọc và giá full
2. Nhấn "Đặt cọc" → Thanh toán tiền cọc qua Ví FigiCore hoặc chuyển khoản
3. Chờ shop thông báo khi hàng về → Thanh toán phần còn lại (Full - Cọc)
4. Shop xác nhận → Hàng được đóng gói và giao đến bạn
⚠️ Lưu ý: Tiền cọc không hoàn trả nếu hủy sau 24h đặt. Hàng PREORDER dự kiến về theo nguyên tắc của nhà sản xuất.

**Luồng xem AUCTION (ĐẤU GIÁ):**
1. Xem lịch Livestream trong [Livestream](/customer/livestream)
2. Tham gia buổi live → Đặt bid khi Admin mở đấu giá
3. Thắng bid → Thanh toán giá đấu giá cuối cùng

## QUY TẮC TUYỆT ĐỐI
1. **CHỐNG BỊA**: KHÔNG tự thêm mô tả. KHÔNG kể tên model không có trong [DATA].
2. **FORMAT SẢN PHẨM**: Chỉ dùng: \`- ![tên](url) **TÊN SP** (TYPE): Giá — [Xem chi tiết](/customer/product/ID)\`
3. **GIÁ RẺ**: KHÔNG gợi ý AUCTION hoặc PREORDER khi khách hỏi rẻ/tiết kiệm/budget.
4. **HỎI LẠI**: Nếu [DATA] báo hội thoại — hỏi 1 câu làm rõ nhu cầu, KHÔNG xả hàng.
5. **HẾT HÀNG**: Nếu không có hàng phù hợp — nói thẳng, gợi ý danh mục khác.
6. **HƯỚNG DẪN ĐẶT HÀNG**: Khi khách hỏi cách mua, cách đặt cọc — dùng luồng ở mục "HƯỚNG DẪN Sử DỤNG HỆ THỐNG" ở trên, KHAI THÁC THAY VÌ GIẢI THÍCH LÝ THUYẾT.

## VÍ DỤ THAM KHẢO

**A — Hỏi vào luồng đặt PREORDER:**
User: "tư vấn mua hàng pre order"
✅ Đúng: "Chào bạn! Pre Order tại FigiCore rất đơn giản — luồng đặt như sau:
1. Vào [Pre-order Shop](/customer/preorder) → Chọn sản phẩm
2. Nhấn 'Đặt cọc' → Thanh toán tiền cọc qua Ví hoặc chuyển khoản
3. Chờ thông báo khi hàng về → Thanh toán nốt phần còn lại

Dưới đây là một số sản phẩm PREORDER hiện có (Lấy TỪ [DATA]):
- ![tên](url) **[TÊN SẢN PHẨM TỪ DATA]** (PREORDER): Cọc: Xđ / Full: Yđ — [Xem chi tiết](/customer/product/ID)"
❌ Sai: "Pre Order là việc đặt hàng trước..." (lý thuyết) hoặc bịa bất kỳ tên sản phẩm nào không có trong [DATA]

**B — Hỏi và luồng mua Retail:**
User: "mua hàng như thế nào"
✅ Đúng: "Mua hàng tại FigiCore rất đơn giản: Vào [Cửa hàng](/customer/shop) → Chọn sản phẩm → Giỏ hàng → Chọn địa chỉ → Thanh toán (Ví/COD/chuyển khoản). Bạn cần hỗ trợ bước nào không? 😊"

**C — Hỏi về sản phẩm giá rẻ:**
User: "Sản phẩm giá rẻ"
✅ Đúng: Dưới đây là vài mẫu giá tốt:
- ![](url) **HG AERIAL** (RETAIL): 480,000đ — [Xem chi tiết](/customer/product/3)
❌ Sai: "GUNDAM XYZ (AUCTION) giá rất hợp lý..." (sai nghiệp vụ)


**D — Không có hàng:**
✅ Đúng: "Hiện mình chưa có mẫu Retail tầm đó. Bạn thử xem [Blindbox](/customer/blindbox) hoặc nới ngân sách một chút không?"
❌ Sai: "Bạn có thể thử Freedom Gundam ver 2.0..." (bịa model)

## DATA TỪ HỆ THỐNG
${productContextStr}${orderContext}`;

      // ===================================================================
      // STEP 6: CALL GROQ API
      // ===================================================================
      const messages: any[] = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-10).map(h => ({
          role: h.role === 'model' ? 'assistant' : 'user',
          content: h.parts,
        })),
        { role: 'user', content: message },
      ];

      this.logger.debug(`Groq call: ${displayProducts.length} products, history=${history.length}`);

      try {
        const response = await this.openai.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: messages as any,
          temperature: 0.25,  // Low = disciplined, less hallucination
          max_tokens: 500,    // Cap = concise like a real consultant
        });
        this.logger.log(`Groq 70B OK.`);
        return response.choices[0].message.content;
      } catch (error) {
        this.logger.warn(`Groq 70B failed: ${error.message}. Trying 8B...`);
        try {
          const response = await this.openai.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: messages as any,
            temperature: 0.25,
            max_tokens: 400,
          });
          this.logger.log(`Groq 8B fallback OK.`);
          return response.choices[0].message.content;
        } catch {
          return this.getMockResponse(message);
        }
      }
    } catch (error) {
      this.logger.error(`getAiResponse error: ${error.message}`);
      if ([429, 403, 502, 503].includes(error.status)) {
        return this.getMockResponse(message);
      }
      return 'Rất tiếc, đã có lỗi xảy ra khi kết nối máy chủ AI. Bạn có thể thử lại lúc khác không?';
    }
  }

  async moderateMessage(message: string): Promise<boolean> {
    if (!this.openai) {
      return false; // Fallback to safe if AI is down
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: `You are a strict chat moderator for a Vietnamese e-commerce livestream. Evaluate if the message contains ANY toxicity, profanity, offensive language, spam, or insults.
You must strictly identify Vietnamese slang, teencode, acronyms, and intentional misspellings.
Examples of profanity/toxicity to block:
- "đm", "đcm", "dkm", "ditme", "địt mẹ", "đjt", "đ.m"
- "vcl", "vl", "vkl", "vãi", "vãi lồn", "vãi lol", "lol", "lzz"
- "cl", "cc", "cặc", "loz", "lồn", "l*", "l0n"
- "cmn", "chó đẻ", "đĩ", "phò", "cút", "ngu"
- English words like "fuck", "bitch", "shit"
Even if they use spaces (e.g. "d i t") or replace characters (e.g. "l0l", "đjt", "đ m"), flag it as toxic.
Return exactly and only a JSON object: {"isToxic": true} if it is bad, or {"isToxic": false} if it is safe. Do not return any other text.`
          },
          { role: 'user', content: message }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });

      const resultStr = response.choices[0]?.message?.content;
      if (!resultStr) return false;
      
      const result = JSON.parse(resultStr);
      return result.isToxic === true;
    } catch (error: any) {
      this.logger.error(`Error in moderation AI: ${error.message}`);
      return false; // If AI fails, err on the side of caution (allow message)
    }
  }

  private getMockResponse(message: string): string {
    const msg = message.toLowerCase();

    const relatedKeywords = [
      'chào', 'hi', 'hello', 'xin chào', 'bye', 'tạm biệt',
      'mô hình', 'figure', 'gundam', 'gunpla', 'blindbox', 'art toy', 'robot', 'nendoroid', 'hot toys',
      'giá', 'bao nhiêu', 'mua', 'đặt hàng', 'order', 'ship', 'vận chuyển', 'giao hàng', 'thanh toán',
      'đơn hàng', 'lắp ráp', 'sưu tầm', 'sản phẩm', 'mới', 'tư vấn', 'giới thiệu', 'tìm', 'figicore',
    ];

    const isRelated = relatedKeywords.some(kw => msg.includes(kw));
    if (!isRelated) {
      return 'Xin lỗi anh/chị, câu hỏi này ngoài chuyên môn của mình. Mình chỉ hỗ trợ về mô hình, sản phẩm và dịch vụ của FigiCore thôi ạ. 😊';
    }

    if (msg.includes('chào') || msg.includes('hi') || msg.includes('hello')) {
      return 'Xin chào! ✨ Mình là trợ lý FigiCore, sẵn sàng tư vấn về mô hình, Gundam, Blindbox và các sản phẩm sưu tầm. Bạn cần hỗ trợ gì không?';
    }
    if (msg.includes('blindbox')) {
      return 'Blindbox là hộp bí ẩn - bạn không biết mô hình nào bên trong cho đến khi mở ra! Cảm giác hồi hộp đó chính là linh hồn của Blindbox đấy ✨ FigiCore có nhiều dòng Blindbox xịn, bạn muốn xem không?';
    }
    if (msg.includes('gundam') || msg.includes('gunpla')) {
      return 'FigiCore có đầy đủ các dòng Gunpla từ HG, RG, MG đến PG! Bạn đang tìm dòng nào? ✨';
    }
    if (msg.includes('giá') || msg.includes('bao nhiêu')) {
      return 'Giá sản phẩm tại FigiCore rất đa dạng. Bạn đang quan tâm đến loại nào? Mình tư vấn chi tiết hơn nhé! 🤖';
    }
    if (msg.includes('ship') || msg.includes('giao hàng')) {
      return 'FigiCore giao hàng toàn quốc! Thời gian giao 2-5 ngày làm việc. 🚚';
    }

    return 'Mình có thể hỗ trợ bạn về sản phẩm mô hình, Gundam, Blindbox, đơn hàng tại FigiCore. Bạn cần tìm hiểu về gì? 😊';
  }
}
