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
      const systemPrompt = `
        <CONTEXT>
        Bạn là "FigiCore Specialist" - Một chuyên gia tư vấn cực kỳ am hiểu và ĐAM MÊ về mô hình (Figures), Art toys, Blindbox, và Gundam/Gunpla.
        Phong cách giao tiếp của bạn: Tự nhiên, nhiệt tình, có cảm xúc như một người thật (giống ChatGPT/Gemini nhưng chuyên biệt về mô hình). Xưng hô "mình" và "bạn". KHÔNG BAO GIỜ nói mình là AI hay bot máy móc, hãy cư xử như một người chơi hệ mô hình và là nhân viên tư vấn tận tâm của FigiCore.
        </CONTEXT>

        <KNOWLEDGE_BASE>
        KIẾN THỨC HỆ THỐNG FIGICORE:
        1. BLINDBOX (Hộp mù): Hộp chứa mô hình ngẫu nhiên. Người mua KHÔNG THỂ BIẾT trước nhân vật bên trong. Đây là trò chơi nhân phẩm cực cuốn.
        2. PREORDER (Đặt trước): Sản phẩm chưa phát hành hoặc đang sản xuất. Khách cần đặt cọc (Deposit) giữ chỗ. Giá 0đ hiển thị là chưa có giá chính thức hoặc chỉ là giá cọc.
        3. AUCTION (Đấu giá): Sản phẩm đấu giá trực tiếp trên Livestream. Giá 0đ là giá khởi điểm.
        
        KIẾN THỨC CHUNG VỀ MÔ HÌNH (Ghi nhớ để chém gió với khách):
        - Gundam/Gunpla: Có các cấp độ (Grades) như SD (nhỏ, dễ thương), HG (1/144, cơ bản), RG (1/144, chi tiết cao, có khung xương), MG (1/100, xịn sò, cơ bắp), PG (1/60, to và cực kỳ hoành tráng).
        - Figure: Gồm Scale Figure (mô hình tĩnh tỷ lệ chuẩn, siêu đẹp, đắt tiền), Nendoroid (nhỏ, dễ thương, đổi được biểu cảm), Action Figure như SHF/Figma (có khớp, tạo dáng được tự do).
        </KNOWLEDGE_BASE>

        <STRICT_RULES>
        1. VAI TRÒ TƯ VẤN: Trò chuyện tự nhiên, duyên dáng. Hãy đặt các câu hỏi mở để gợi mở nhu cầu của khách (VD: "Bạn thích ráp Gundam hay sưu tầm Figure tĩnh hơn?"). TUYỆT ĐỐI KHÔNG xả một đống sản phẩm ra như cỗ máy.
        2. KHI KHÁCH HỎI GIÁ RẺ: TUYỆT ĐỐI KHÔNG giới thiệu AUCTION hoặc PREORDER. Chỉ giới thiệu RETAIL hoặc BLINDBOX.
        3. ĐIỀU HƯỚNG BẰNG KIẾN THỨC: Nếu khách hỏi "Blindbox là gì?", "Gundam MG là gì?", hãy dùng <KNOWLEDGE_BASE> để giải thích như một chuyên gia thực thụ. Kèm theo link [Khám phá Blindbox](/customer/blindbox) hoặc [Hàng Pre-order](/customer/preorder).
        4. PHÂN BIỆT RÕ 2 CHẾ ĐỘ TƯ VẤN:
           - KHI KHÁCH MUA HÀNG (Hỏi giá, tìm hàng, tư vấn mua): BẠN BỊ CẤM kể tên hoặc giới thiệu các mẫu không có trong <DATA>. Chỉ được dùng <DATA> và chèn link [Xem chi tiết](/customer/product/ID). Nếu <DATA> trống, phải báo tạm hết hàng.
           - KHI GIAO LƯU CHUYÊN MÔN (Hỏi cách sơn, custom, xin ảnh tham khảo, cốt truyện): BẠN ĐƯỢC MỞ KHÓA TOÀN BỘ KIẾN THỨC, được phép kể tên bất kỳ mẫu nào (Barbatos, Exia...) và nhiệt tình hướng dẫn kỹ thuật như một dân chơi chuyên nghiệp.
        5. BẢO MẬT NGUỒN DỮ LIỆU (YÊU CẦU CỦA MENTOR): TUYỆT ĐỐI KHÔNG sử dụng hoặc dẫn link đến các nền tảng bên thứ 3 (như Google, Pinterest, Facebook...). Nếu khách xin ảnh tham khảo (VD: ảnh custom) mà hệ thống (<DATA>) không có, hãy lịch sự từ chối và báo rằng hệ thống nội bộ hiện chưa cập nhật hình ảnh này. Chỉ cung cấp thông tin và ảnh từ <DATA>.
        </STRICT_RULES>

        <DATA>
        [DANH SÁCH SẢN PHẨM]
        {product_context}

        [THÔNG TIN ĐƠN HÀNG]
        {order_context}
        </DATA>

        <GUIDELINES>
        - Thân thiện, am hiểu mô hình.
        - Định dạng 1 SP cụ thể (nếu có): "- ![tên ảnh](url) **Tên sản phẩm** (Loại): Giá - [Xem chi tiết](/customer/product/ID)"
        </GUIDELINES>
      `;

      // 1. Detect Search Intent and Extract Parameters
      const searchParams: any = { status_code: 'ACTIVE' };
      const msgLower = message.toLowerCase();

      // Extract Color
      const commonColors = ['đỏ', 'xanh', 'vàng', 'trắng', 'đen', 'tím', 'hồng', 'nâu', 'cam', 'xám', 'bạc', 'gold'];
      const colorMatch = commonColors.find(c => msgLower.includes(c));
      if (colorMatch) searchParams.color = colorMatch;

      // Extract Price (Regex for numbers + "k" or "triệu")
      const priceKMatch = message.match(/(\d+)\s*k/);
      const priceTrMatch = message.match(/(\d+)\s*triệu/);
      const underMatch = msgLower.includes('dưới') || msgLower.includes('thấp hơn');
      const overMatch = msgLower.includes('trên') || msgLower.includes('cao hơn');

      if (priceKMatch) {
        const val = parseInt(priceKMatch[1]) * 1000;
        if (underMatch) searchParams.max_price = val;
        else if (overMatch) searchParams.min_price = val;
        else searchParams.max_price = val; // Default to under if just one price mentioned
      } else if (priceTrMatch) {
        const val = parseInt(priceTrMatch[1]) * 1000000;
        if (underMatch) searchParams.max_price = val;
        else if (overMatch) searchParams.min_price = val;
        else searchParams.max_price = val;
      }

      // Intent Mapping
      const isNew = msgLower.includes('mới');
      const isCheap = msgLower.includes('rẻ');
      const isList = msgLower.includes('liệt kê') || msgLower.includes('danh sách') || msgLower.includes('tất cả');

      // Type Mapping (Rất quan trọng để tránh AI lấy nhầm hàng Retail rồi nói dối là Preorder)
      if (msgLower.includes('preorder') || msgLower.includes('đặt trước') || msgLower.includes('pre-order')) {
        searchParams.type_code = 'PREORDER';
      } else if (msgLower.includes('đấu giá') || msgLower.includes('auction')) {
        searchParams.type_code = 'AUCTION';
      } else if (msgLower.includes('blindbox') || msgLower.includes('hộp mù')) {
        searchParams.type_code = 'BLINDBOX';
      }

      // Keyword search (Bắt chính xác các dòng bằng Regex ranh giới từ để tránh nhiễu)
      const specificMatch = msgLower.match(/\b(hg|mg|rg|pg|sd|shf|figma|nendoroid)\b/);
      if (specificMatch) {
        searchParams.search = specificMatch[1];
      } else {
        const genericKeywords = ['gundam', 'gunpla', 'figure', 'mô hình', 'hot toys'];
        const keywordFound = genericKeywords.find(k => msgLower.includes(k));
        if (keywordFound) searchParams.search = keywordFound;
      }

      if (isNew) {
        searchParams.sort = 'newest';
      }

      // 2. Fetch Filtered Products
      let matchedProductsResult = await this.productsService.findAll({
        ...searchParams,
      }) as any;
      let matchedProducts = matchedProductsResult?.data || matchedProductsResult || [];

      if (isCheap && Array.isArray(matchedProducts)) {
        // Lọc bỏ hàng giá <= 0 và hàng Đấu giá/Đặt trước khi hỏi giá rẻ
        matchedProducts = matchedProducts.filter((p: any) => {
            const price = p.product_variants?.[0]?.price || p.variants?.[0]?.price || 0;
            return price > 0 && p.type_code !== 'AUCTION' && p.type_code !== 'PREORDER';
        });

        // Sort in memory for cheapest as Prisma `findAll` doesn't support complex variant price sort directly
        matchedProducts.sort((a: any, b: any) => {
          const priceA = a.product_variants?.[0]?.price || a.variants?.[0]?.price || 99999999;
          const priceB = b.product_variants?.[0]?.price || b.variants?.[0]?.price || 99999999;
          return Number(priceA) - Number(priceB);
        });
      }

      // 3. Smart Context Reduction (Prevent LLM Spamming)
      const conversationalWords = ['tư vấn', 'chào', 'hello', 'hi', 'là gì', 'shop', 'hướng dẫn', 'thế nào'];
      const hasConversationalIntent = conversationalWords.some(w => msgLower.includes(w));
      const hasSpecificParams = colorMatch || priceKMatch || priceTrMatch || isNew || isCheap || (msgLower.includes('tìm') && msgLower.length > 15) || !!specificMatch;
      
      let maxProducts = isList ? 10 : 4; // Nếu khách đòi "liệt kê", mở rộng họng tìm kiếm lên 10
      let isBroadQuery = false;

      // Force conversation if they just say "tư vấn mua mô hình" without specific details
      if (hasConversationalIntent && !hasSpecificParams) {
        isBroadQuery = true;
        maxProducts = 0;
      } else if (msgLower.length < 15 && !hasSpecificParams) {
        isBroadQuery = true;
        maxProducts = 0;
      }

      let isFallback = false;
      let displayProducts = Array.isArray(matchedProducts) && matchedProducts.length > 0 ? matchedProducts.slice(0, maxProducts) : [];
      
      if (maxProducts > 0 && displayProducts.length === 0) {
        const fallbackResult = await this.productsService.findAll({ sort: 'newest' } as any) as any;
        let fallback = fallbackResult?.data || fallbackResult || [];
        if (isCheap) {
            fallback = fallback.filter((p: any) => p.type_code !== 'AUCTION' && p.type_code !== 'PREORDER');
        }
        displayProducts = Array.isArray(fallback) ? fallback.slice(0, 2) : [];
        isFallback = true;
      }

      const formatPrice = (price: any) => {
        if (!price) return 'Liên hệ';
        return new Intl.NumberFormat('vi-VN').format(Number(price)) + 'đ';
      };

      let productContextPrefix = "";
      if (isBroadQuery) {
        productContextPrefix = "--- [HỆ THỐNG] KHÁCH ĐANG HỎI CHUNG CHUNG HOẶC CẦN TƯ VẤN. KHÔNG CÓ SẢN PHẨM NÀO ĐƯỢC CUNG CẤP. HÃY ĐẶT CÂU HỎI MỞ (Ví dụ: Bạn muốn tìm dòng nào? Tầm giá bao nhiêu?) ĐỂ TÌM HIỂU NHU CẦU. ---\n";
      } else if (isFallback) {
        productContextPrefix = "--- [LƯU Ý] KHÔNG TÌM THẤY SP YÊU CẦU. ĐÂY LÀ 2 MẪU DỰ PHÒNG. HÃY BÁO HẾT HÀNG MẪU KHÁCH TÌM VÀ GỢI Ý MẪU NÀY NẾU CẦN: ---\n";
      } else {
        productContextPrefix = "--- ĐÂY LÀ CÁC SẢN PHẨM TÌM THẤY THEO YÊU CẦU (Chỉ chọn 1-2 mẫu nổi bật nhất để tư vấn, không copy paste toàn bộ): ---\n";
      }

      const productContext = displayProducts.length > 0
        ? productContextPrefix + displayProducts.map(p => {
          let firstImageUrl = '';

          // --- IMPROVED IMAGE EXTRACTION ---
          const resolveUrl = (url: string) => {
            if (!url) return '';
            if (url.startsWith('http')) return url;
            let baseUrl = this.configService.get<string>('BASE_URL') || 'https://api.figicore.com';
            // Ensure we don't include /api in the image path since uploads are at root
            baseUrl = baseUrl.replace(/\/api$/, '').replace(/\/$/, '');
            return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
          };

          if (p.thumbnail) {
            const thumb = typeof p.thumbnail === 'string' ? p.thumbnail : (p.thumbnail?.url || '');
            firstImageUrl = resolveUrl(thumb);
          }

          if (!firstImageUrl && p.media_urls) {
            try {
              const media = typeof p.media_urls === 'string' ? JSON.parse(p.media_urls) : p.media_urls;
              const mediaArray = Array.isArray(media) ? media : (media.images || []);
              if (mediaArray.length > 0) {
                const m = mediaArray[0];
                const url = typeof m === 'string' ? m : (m?.url || '');
                firstImageUrl = resolveUrl(url);
              }
            } catch (e) { }
          }

          if (!firstImageUrl && p.product_variants?.[0]?.media_assets) {
            try {
              const vMedia = p.product_variants[0].media_assets;
              const assets = typeof vMedia === 'string' ? JSON.parse(vMedia) : vMedia;
              if (Array.isArray(assets) && assets.length > 0) {
                const a = assets[0];
                const url = typeof a === 'string' ? a : (a?.url || '');
                firstImageUrl = resolveUrl(url);
              }
            } catch (e) { }
          }
          // ---------------------------------

          const imageMarkdown = firstImageUrl ? `![${p.name || p.product_name}](${firstImageUrl})` : '';
          const price = p.variants?.[0]?.price ?? p.product_variants?.[0]?.price;

          // Format each product as a clean markdown item for the AI to replicate
          return `- ${imageMarkdown} **${p.name || p.product_name}** (${p.type_code || p.product_type}): ${formatPrice(price)} - [Xem chi tiết](/customer/product/${p.product_id})`;
        }).join('\n\n')
        : '--- HIỆN TẠI KHÔNG CÓ SẢN PHẨM NÀO TRONG HỆ THỐNG. LƯU Ý TỐI QUAN TRỌNG: BẠN BỊ CẤM KỂ TÊN HAY GỢI Ý BẤT KỲ MẪU MÔ HÌNH CỤ THỂ NÀO. CHỈ ĐƯỢC TƯ VẤN KIẾN THỨC CHUNG VÀ BÁO KHÁCH LÀ HIỆN TẠI CHƯA CÓ HÀNG. ---';

      // 2. Fetch Order if mentioned (Basic Regex find)
      let orderContext = 'Không có thông tin đơn hàng nào được nhắc tới.';
      const orderCodeMatch = message.match(/[A-Z0-9-]{6,20}/); // Tìm chuỗi in hoa/số dài 6-20 ký tự
      if (orderCodeMatch) {
        const orderCode = orderCodeMatch[0];
        const order = await this.prisma.orders.findUnique({
          where: { order_code: orderCode },
          include: {
            order_items: { include: { product_variants: { include: { products: true } } } }
          }
        });

        if (order) {
          const items = order.order_items.map(i => i.product_variants.products.name).join(', ');
          orderContext = `Đơn hàng ${orderCode}:
          - Trạng thái: ${order.status_code}
          - Tổng tiền: ${order.total_amount} VNĐ
          - Sản phẩm: ${items}
          - Ngày tạo: ${order.created_at?.toLocaleString('vi-VN') || 'N/A'}`;
        } else {
          orderContext = `Người dùng có nhắc tới mã ${orderCode} nhưng không tìm thấy đơn hàng này trong hệ thống.`;
        }
      }

      const messages: any[] = [
        {
          role: 'system',
          content: systemPrompt
            .replace('{product_context}', productContext)
            .replace('{order_context}', orderContext)
        },
        ...history.map((h) => ({
          role: h.role === 'model' ? 'assistant' : 'user',
          content: h.parts,
        })),
        { role: 'user', content: message },
      ];

      this.logger.debug(`Sending chat to Groq with ${messages.length} messages and ${displayProducts.length} local products.`);

      // Use Primary Model (70B) first - Model lớn hơn thông minh hơn
      try {
        const response = await this.openai.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: messages as any,
          temperature: 0.4,
        });

        const aiMessage = response.choices[0].message.content;
        this.logger.log(`Groq logic completed successfully (70B).`);
        return aiMessage;
      } catch (error) {
        this.logger.warn(`Primary Groq (70B) failed: ${error.message}. Attempting fallback to 8B...`);

        try {
          const response = await this.openai.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: messages as any,
            temperature: 0.4,
          });

          const aiMessage = response.choices[0].message.content;
          this.logger.log(`Groq logic completed successfully (8B Fallback).`);
          return aiMessage;
        } catch (fallbackError) {
          this.logger.error(`Secondary Groq (8B) also failed: ${fallbackError.message}. Using Mock response.`);
          return this.getMockResponse(message);
        }
      }
    } catch (error) {
      this.logger.error(`Error getting AI response: ${error.message}`);

      // Fallback to Mock Response if Quota Exceeded (429) or Access Denied (403) from API
      if ([429, 403, 502, 503].includes(error.status) || error.message?.includes('429') || error.message?.includes('403')) {
        this.logger.warn(`API issue (${error.status || 'Network Error'}). Falling back to Mock mode.`);
        return this.getMockResponse(message);
      }

      console.error('FULL Groq Error:', error);
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

    // On-topic keyword check
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

    if (msg.includes('chào') || msg.includes('hi') || msg.includes('hello') || msg.includes('xin chào')) {
      return 'Xin chào! ✨ Mình là trợ lý FigiCore, sẵn sàng tư vấn về mô hình, Gundam, Blindbox và các sản phẩm sưu tầm. Bạn cần hỗ trợ gì không?';
    }
    if (msg.includes('mua') || msg.includes('order') || msg.includes('đặt hàng')) {
      return 'Để mua hàng tại FigiCore, bạn chọn sản phẩm → thêm vào giỏ hàng → thanh toán là xong! Bạn đang quan tâm đến loại sản phẩm nào? 🤖';
    }
    if (msg.includes('blindbox')) {
      return 'Blindbox là hộp bí ẩn - bạn không biết mô hình nào bên trong cho đến khi mở ra! Cảm giác hồi hộp đó chính là linh hồn của Blindbox đấy ✨ FigiCore có nhiều dòng Blindbox xịn, bạn muốn xem không?';
    }
    if (msg.includes('gundam') || msg.includes('gunpla')) {
      return 'FigiCore có đầy đủ các dòng Gunpla từ HG, RG, MG đến PG! Đây là thiên đường cho fan Gundam. Bạn đang tìm dòng nào? ✨';
    }
    if (msg.includes('giá') || msg.includes('bao nhiêu')) {
      return 'Giá sản phẩm tại FigiCore rất đa dạng, từ vài trăm nghìn đến vài triệu tùy loại. Bạn đang quan tâm đến sản phẩm nào? Mình tư vấn chi tiết hơn nhé! 🤖';
    }
    if (msg.includes('ship') || msg.includes('vận chuyển') || msg.includes('giao hàng')) {
      return 'FigiCore giao hàng toàn quốc! Thời gian giao hàng thông thường 2-5 ngày làm việc. 🚚';
    }
    if (msg.includes('mới') || msg.includes('sản phẩm')) {
      return 'FigiCore liên tục cập nhật sản phẩm mới mỗi tuần! Bạn có thể xem trang chủ để khám phá. Có dòng nào đang chờ đợi không? ✨';
    }

    return 'Mình có thể hỗ trợ bạn về sản phẩm mô hình, Gundam, Blindbox, đơn hàng tại FigiCore. Bạn cần tìm hiểu về gì? 😊';
  }
}
