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
        Bạn là "FigiCore Specialist" - Chuyên gia tư vấn của FigiCore.
        FigiCore chuyên: Figures, Art toys, Blindbox, Gundam/Gunpla.
        </CONTEXT>

        <STRICT_RULES>
        1. LẮNG NGHE & TƯƠNG TÁC: Nếu khách hàng hỏi chung chung (ví dụ "Tôi muốn tư vấn", "Chào bạn"), KHÔNG ĐƯỢC list một loạt sản phẩm. Hãy chào hỏi và đặt câu hỏi mở để tìm hiểu nhu cầu (dòng sản phẩm, kích thước, mức giá mong muốn).
        2. CHỈ GỢI Ý SẢN PHẨM KHI CẦN THIẾT: Chỉ hiển thị sản phẩm từ thẻ <DATA> khi khách có yêu cầu cụ thể (màu sắc, giá, từ khóa) hoặc khi bạn thực sự muốn nhá hàng 1-2 mẫu tiêu biểu. KHÔNG BAO GIỜ hiển thị toàn bộ danh sách 10 sản phẩm cùng lúc gây rối mắt.
        3. LINK DANH MỤC QUAN TRỌNG:
           - Trang Blindbox: [Khám phá toàn bộ Blindbox](/customer/blindbox)
           - Trang Pre-order: [Xem hàng Pre-order](/customer/preorder)
           - Nếu khách hỏi "Blindbox là gì?", hãy giải thích ngắn gọn, sinh động và đính kèm link Trang Blindbox ở trên thay vì dẫn trực tiếp vào một sản phẩm cụ thể.
        4. TUYỆT ĐỐI KHÔNG tự bịa ra sản phẩm, giá cả, ảnh hoặc URL.
        </STRICT_RULES>

        <DATA>
        [DANH SÁCH SẢN PHẨM]
        {product_context}

        [THÔNG TIN ĐƠN HÀNG]
        {order_context}
        </DATA>

        <GUIDELINES>
        - Thân thiện, am hiểu mô hình.
        - Định dạng hiển thị 1 SP cụ thể (nếu có): "- ![tên ảnh](url) **Tên sản phẩm** (Loại): Giá - [Xem chi tiết](/customer/product/ID)"
        - Giữ nguyên link [Xem chi tiết](/...) và ID.
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

      // Keyword search (only product types/names, NOT intent words)
      const keywords = ['gundam', 'figure', 'blindbox', 'mô hình', 'hot toys', 'nendoroid'];
      const keywordFound = keywords.find(k => msgLower.includes(k));
      if (keywordFound) searchParams.search = keywordFound;

      if (isNew) {
        searchParams.sort = 'newest';
      }

      // 2. Fetch Filtered Products
      let matchedProductsResult = await this.productsService.findAll({
        ...searchParams,
      }) as any;
      let matchedProducts = matchedProductsResult?.data || matchedProductsResult || [];

      if (isCheap && Array.isArray(matchedProducts)) {
        // Sort in memory for cheapest as Prisma `findAll` doesn't support complex variant price sort directly
        matchedProducts.sort((a: any, b: any) => {
          const priceA = a.product_variants?.[0]?.price || a.variants?.[0]?.price || 99999999;
          const priceB = b.product_variants?.[0]?.price || b.variants?.[0]?.price || 99999999;
          return Number(priceA) - Number(priceB);
        });
      }

      // If no filtered results, fall back to newest recommendations
      let isFallback = false;
      let displayProducts = Array.isArray(matchedProducts) && matchedProducts.length > 0 ? matchedProducts.slice(0, 10) : [];
      if (displayProducts.length === 0) {
        const fallbackResult = await this.productsService.findAll({ sort: 'newest' } as any) as any;
        const fallback = fallbackResult?.data || fallbackResult || [];
        displayProducts = Array.isArray(fallback) ? fallback.slice(0, 10) : [];
        isFallback = true;
      }

      const formatPrice = (price: any) => {
        if (!price) return 'Liên hệ';
        return new Intl.NumberFormat('vi-VN').format(Number(price)) + 'đ';
      };

      const isGeneralGreeting = !keywordFound && !colorMatch && !priceKMatch && !priceTrMatch;

      let productContextPrefix = "";
      if (isFallback) {
        productContextPrefix = "--- [LƯU Ý] KHÔNG TÌM THẤY SP HOẶC KHÁCH CHỈ CHÀO HỎI. Đây là danh sách dự phòng. HÃY TƯƠNG TÁC VÀ HỎI NHU CẦU KHÁCH TRƯỚC, CHỈ GỢI Ý TỐI ĐA 1-2 MẪU NẾU CẦN: ---\n";
      } else if (isGeneralGreeting) {
        productContextPrefix = "--- [LƯU Ý] KHÁCH ĐANG HỎI CHUNG CHUNG. HÃY TƯƠNG TÁC VÀ HỎI RÕ NHU CẦU, CHỈ GỢI Ý TỐI ĐA 1-2 MẪU TRONG DANH SÁCH DƯỚI ĐÂY NẾU CẦN: ---\n";
      } else {
        productContextPrefix = "--- ĐÂY LÀ CÁC SẢN PHẨM TÌM THẤY CHÍNH XÁC THEO YÊU CẦU (Bạn có thể giới thiệu vài mẫu phù hợp nhất): ---\n";
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
        : '--- Danh sách đang được làm mới. Hãy giới thiệu FigiCore như cửa hàng chuyên mô hình sưu tầm cao cấp và mời khách ghé trang chủ để xem bộ sưu tập mới nhất. ---';

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

      // Use Primary Model (8B) first
      try {
        const response = await this.openai.chat.completions.create({
          model: 'llama-3.1-8b-instant',
          messages: messages as any,
          temperature: 0.0,
        });

        const aiMessage = response.choices[0].message.content;
        this.logger.log(`Groq logic completed successfully (8B).`);
        return aiMessage;
      } catch (error) {
        this.logger.warn(`Primary Groq (8B) failed: ${error.message}. Attempting fallback to 70B...`);

        try {
          const response = await this.openai.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: messages as any,
            temperature: 0.0,
          });

          const aiMessage = response.choices[0].message.content;
          this.logger.log(`Groq logic completed successfully (70B Fallback).`);
          return aiMessage;
        } catch (fallbackError) {
          this.logger.error(`Secondary Groq (70B) also failed: ${fallbackError.message}. Using Mock response.`);
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
