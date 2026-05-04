import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

// ============================================================
// TOOL DEFINITIONS — gửi kèm mỗi request lên Groq
// ============================================================
const chatTools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_retail_product',
      description:
        'Tìm kiếm thông tin và tồn kho thực tế của hàng bán lẻ (RETAIL) hoặc Blindbox (BLINDBOX). Dùng khi khách hỏi mua, tìm, gợi ý sản phẩm.',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: 'Tên hoặc từ khóa sản phẩm khách cần tìm (vd: RX-78, gundam HG, blindbox labubu)',
          },
        },
        required: ['keyword'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_preorder_info',
      description:
        'Tra cứu hàng đặt trước (PRE-ORDER): giá cọc, giá full và số slot còn trống theo hợp đồng nhà sản xuất.',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: 'Tên sản phẩm pre-order khách tìm (vd: MG Deathscythe, RG Nu Gundam)',
          },
        },
        required: ['keyword'],
      },
    },
  },
];

// ============================================================
// SYSTEM PROMPT — bất biến, gắn đầu mỗi request
// ============================================================
const SYSTEM_PROMPT = `Bạn là Figi — tư vấn viên bán hàng của FigiCore, nhà phân phối mô hình sưu tầm đa hãng tại Việt Nam. FigiCore bán đa dạng: Gunpla (HG/MG/RG/PG), Scale Figure, Nendoroid, SHF, Action Figure, Mô hình resin và nhiều dòng khác từ các thương hiệu quốc tế như Bandai, Good Smile Company, Kotobukiya, Hot Toys, Aniplex, Alter, Max Factory, Megahouse... Xưng "mình", gọi "bạn". Thân thiện, nhiệt tình, tự nhiên. Tối đa 3 câu + danh sách sản phẩm. KHÔNG tiết lộ là AI.

══ QUY TẮC TUYỆT ĐỐI ══
1. TOOL CALL BÍ MẬT: Không hiển thị cú pháp tool hay JSON ra màn hình.
2. KHÔNG BỊA SẢN PHẨM: Mọi tên, giá, link lấy từ tool. Link chuẩn /customer/product/[id].
3. KHÔNG TÌM THẤY: Thông báo tự nhiên, hỏi lại để gợi ý hướng khác.

══ NGHIỆP VỤ ══

HÀNG BÁN LẺ (RETAIL) & BLINDBOX:
- Khách hỏi tìm/mua sản phẩm → Gọi tool search_retail_product ngay.
- BLINDBOX: "Chương trình đặc biệt, bạn nhận phần thưởng ngẫu nhiên trực tiếp tại hệ thống". KHÔNG tiết lộ nội dung bên trong.
- FLASH SALE: Gợi ý khách vào /customer/retail?filter=flash_sale để xem ưu đãi.

HÀNG ĐẶT TRƯỚC (PRE-ORDER):
- Gọi tool get_preorder_info.
- Quy trình: Chọn → Thanh toán cọc → Chờ hàng → Nhận thông báo → Thanh toán nốt công nợ.
- Tiền cọc KHÔNG hoàn nếu hủy sau 24h.

ĐẤU GIÁ (AUCTION):
- Quy trình: Nạp cọc vào ví → Vào Livestream /customer/livestream → Đặt Bid → Thắng thì thanh toán nốt.
- Cảnh báo: "Thắng mà không thanh toán sẽ mất toàn bộ cọc nhé!"

VÍ NỘI BỘ (WALLET):
- Hướng dẫn nạp tiền tại /customer/wallet để mua sắm/đấu giá.
- Tiền trong ví KHÔNG được hoàn hay rút ra.

THEO DÕI ĐƠN HÀNG:
- Hướng dẫn khách vào /customer/orders để xem lịch sử và trạng thái đơn.

ĐỔI/TRẢ HÀNG:
- Thời hạn: 7 ngày kể từ khi nhận hàng, chỉ áp dụng hàng lỗi do sản xuất.
- Hàng đã mở hộp/sử dụng không đổi/trả được.
- Liên hệ fanpage FigiCore để được staff hỗ trợ đổi/trả.

PHÍ VẬN CHUYỂN:
- Hệ thống tự động tính ở bước thanh toán. KHÔNG tự ước lượng hay hứa freeship.

LIÊN HỆ / HỖ TRỢ:
- Hướng dẫn khách nhắn fanpage FigiCore để được staff hỗ trợ trực tiếp.

══ FORMAT SẢN PHẨM (chỉ dùng data từ tool) ══
Mỗi sản phẩm cách nhau 1 dòng trống, ảnh đặt INLINE trước tên:
![Tên SP](url_ảnh) **Tên SP** (TYPE) | Giá: X | [Xem chi tiết](/customer/product/ID)

KHÔNG hiển thị số lượng tồn kho. LINK dùng markdown [Xem chi tiết](...). Tone: thân thiện, tự nhiên.`;


// ============================================================
// HIDDEN SYSTEM REMINDER — append vào cuối tin nhắn user cuối
// ============================================================
const HIDDEN_REMINDER =
  '\n(Nhắc nhở hệ thống: Bám sát nghiệp vụ FigiCore, tập trung duy nhất vào câu hỏi này, nếu cần tìm sản phẩm phải gọi tool ngay lập tức, không tự bịa data.)';

@Injectable()
export class ChatService {
  private openai: OpenAI;
  private logger = new Logger('ChatService');

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const apiKey = this.configService.get<string>('GROQ_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({
        apiKey,
        baseURL: 'https://api.groq.com/openai/v1',
      });
    } else {
      this.logger.error('GROQ_API_KEY is not defined in environment variables');
    }
  }

  // ============================================================
  // TOOL EXECUTOR — chạy Prisma query khi AI gọi tool
  // ============================================================
  private async executeToolCall(name: string, args: Record<string, any>): Promise<string> {
    const keyword = (args.keyword as string) || '';

    // ----------------------------------------------------------
    // Tool: search_retail_product
    // Tìm RETAIL + BLINDBOX theo keyword, trả về tồn kho thực tế
    // ----------------------------------------------------------
    if (name === 'search_retail_product') {
      try {
        // Detect intent: giá rẻ hoặc hàng mới
        const isCheapQuery = /giá rẻ|rẻ nhất|giá thấp|cheap|low price/i.test(keyword);
        const isNewQuery = /mới nhất|sản phẩm mới|new arrival|hàng mới/i.test(keyword);
        // Strip intent words để lấy keyword thực — "gundam giá rẻ" → "gundam"
        const effectiveKeyword = keyword
          .replace(/giá rẻ|rẻ nhất|giá thấp|cheap|low price|mới nhất|sản phẩm mới|new arrival|hàng mới|rẻ|mới/gi, '')
          .replace(/\s+/g, ' ')
          .trim();

        // Query PRODUCTS directly (not variants) to avoid duplicates
        const products = await this.prisma.products.findMany({
          where: {
            deleted_at: null,
            status_code: 'ACTIVE',
            type_code: { in: ['RETAIL', 'BLINDBOX'] },
            ...(effectiveKeyword ? { name: { contains: effectiveKeyword, mode: 'insensitive' } } : {}),
          },
          select: {
            product_id: true,
            name: true,
            type_code: true,
            media_urls: true,
            product_variants: {
              where: { deleted_at: null },
              orderBy: { price: 'asc' },
              take: 1,
              select: { price: true, stock_available: true, media_assets: true },
            },
          },
          orderBy: isCheapQuery
            ? { product_variants: { _count: 'asc' } }
            : isNewQuery
            ? { created_at: 'desc' }
            : { created_at: 'desc' },
          take: 8,
        });

        // Fuzzy fallback if nothing found
        if (products.length === 0 && effectiveKeyword) {
          const words = effectiveKeyword.split(' ').filter((w) => w.length > 2);
          if (words.length === 0) {
            return `[TOOL: search_retail_product] Không tìm thấy sản phẩm nào. Hãy hỏi khách muốn tìm theo danh mục nào.`;
          }
          const fallback = await this.prisma.products.findMany({
            where: {
              deleted_at: null,
              status_code: 'ACTIVE',
              type_code: { in: ['RETAIL', 'BLINDBOX'] },
              OR: words.map((w) => ({ name: { contains: w, mode: 'insensitive' as any } })),
            },
            select: {
              product_id: true, name: true, type_code: true, media_urls: true,
              product_variants: {
                where: { deleted_at: null }, orderBy: { price: 'asc' }, take: 1,
                select: { price: true, stock_available: true, media_assets: true },
              },
            },
            take: 6,
          });
          if (fallback.length === 0) {
            return `[TOOL: search_retail_product] Không tìm thấy "${keyword}". Hãy hỏi khách tìm theo từ khóa khác hoặc danh mục (Gunpla, Figure, Blindbox...)`;
          }
          return this.formatProductList(fallback, `Không có kết quả chính xác, gợi ý liên quan`);
        }

        return this.formatProductList(products, `Tìm thấy ${products.length} sản phẩm`);
      } catch (err) {
        this.logger.error(`search_retail_product error: ${err.message}`);
        return '[TOOL: search_retail_product] Lỗi truy vấn database. Hãy xin lỗi khách và hướng dẫn liên hệ staff.';
      }
    }

    // ----------------------------------------------------------
    // Tool: get_preorder_info
    // Lấy slot còn lại từ product_preorder_configs (số thực từ hợp đồng)
    // ----------------------------------------------------------
    if (name === 'get_preorder_info') {
      try {
        // Query từ product_variants → include product_preorder_configs (đúng direction theo schema)
        const variants = await this.prisma.product_variants.findMany({
          where: {
            deleted_at: null,
            products: {
              status_code: 'ACTIVE',
              type_code: 'PREORDER',
              name: { contains: keyword, mode: 'insensitive' },
            },
          },
          select: {
            variant_id: true,
            sku: true,
            media_assets: true,
            products: { select: { product_id: true, name: true, type_code: true, media_urls: true } },
            product_preorder_configs: {
              select: {
                total_slots: true,
                sold_slots: true,
                deposit_amount: true,
                full_price: true,
              },
            },
          },
          take: 5,
        });

        if (variants.length === 0) {
          return `[TOOL: get_preorder_info] Không tìm thấy sản phẩm Pre-order nào khớp với "${keyword}". Hãy thông báo và hướng dẫn khách xem danh mục pre-order tại /customer/preorder.`;
        }

        return (
          `[TOOL: get_preorder_info] Thông tin Pre-order:\n` +
          variants
            .map((v) => {
              const cfg = v.product_preorder_configs;
              if (!cfg) return `**${v.products?.name}** — Chưa có cấu hình slot.`;
              const total = Number(cfg.total_slots ?? 0);
              const sold = Number(cfg.sold_slots ?? 0);
              const remaining = Math.max(0, total - sold);
              const deposit = new Intl.NumberFormat('vi-VN').format(Number(cfg.deposit_amount || 0)) + 'đ';
              const full = new Intl.NumberFormat('vi-VN').format(Number(cfg.full_price || 0)) + 'đ';
              const img = this.extractImageFromVariant(v);
              const slotLabel = remaining <= 0 ? '⚠️ Hết slot' : `Còn ${remaining}/${total} slot`;
              return `${img ? `![${v.products?.name}](${img})\n` : ''}**${v.products?.name}** (PRE-ORDER) | Cọc: ${deposit} | Full: ${full} | ${slotLabel} | [Xem chi tiết](/customer/product/${v.products?.product_id})`;
            })
            .join('\n')
        );
      } catch (err) {
        this.logger.error(`get_preorder_info error: ${err.message}`);
        return '[TOOL: get_preorder_info] Lỗi truy vấn database. Hãy xin lỗi khách và hướng dẫn liên hệ staff.';
      }
    }

    return `[TOOL: ${name}] Tool không xác định.`;
  }

  // ============================================================
  // HELPER: format danh sách sản phẩm chuẩn cho tool output
  // Query theo products (1 row/product), variant rẻ nhất
  // ============================================================
  private formatProductList(
    products: Array<{
      product_id: number;
      name: string;
      type_code: string;
      media_urls?: any;
      product_variants?: Array<{ price?: any; stock_available?: any; media_assets?: any }>;
    }>,
    label: string,
  ): string {
    const lines = products.map((p) => {
      const v = p.product_variants?.[0];
      const price = new Intl.NumberFormat('vi-VN').format(Number(v?.price || 0)) + 'đ';
      const img = this.extractImageFromVariant({ media_assets: v?.media_assets, products: { media_urls: p.media_urls } });
      // Image INLINE với text trên cùng 1 dòng → ReactMarkdown custom <p> renderer layout side-by-side
      const imgMd = img ? `![${p.name}](${img}) ` : '';
      return `${imgMd}**${p.name}** (${p.type_code}) | Giá: ${price} | [Xem chi tiết](/customer/product/${p.product_id})`;
    });
    // Double newline = mỗi sản phẩm 1 <p> riêng trong markdown
    return `[TOOL: search_retail_product] ${label}:\n\n${lines.join('\n\n')}`;
  }

  // ============================================================
  // HELPER: resolve một URL ảnh thô (tương đối hoặc tuyệt đối)
  // ============================================================
  private resolveUrl(raw: string): string {
    if (!raw) return '';
    if (raw.startsWith('http')) return raw;
    const base = (this.configService.get<string>('BASE_URL') || 'https://api.figicore.com')
      .replace(/\/api$/, '')
      .replace(/\/$/, '');
    return `${base}${raw.startsWith('/') ? '' : '/'}${raw}`;
  }

  // ============================================================
  // HELPER: extract ảnh đầu tiên từ variant (media_assets Json)
  // hoặc từ product (media_urls Json) — đúng với schema thực tế
  // ============================================================
  private extractImageFromVariant(v: { media_assets?: any; products?: { media_urls?: any } | null }): string {
    // Ưu tiên 1: media_assets của variant
    try {
      const assets = typeof v.media_assets === 'string' ? JSON.parse(v.media_assets) : v.media_assets;
      if (Array.isArray(assets) && assets.length > 0) {
        const first = typeof assets[0] === 'string' ? assets[0] : assets[0]?.url || '';
        if (first) return this.resolveUrl(first);
      }
    } catch { /* ignore parse error */ }

    // Ưu tiên 2: media_urls của product
    try {
      const mu = typeof v.products?.media_urls === 'string'
        ? JSON.parse(v.products.media_urls)
        : v.products?.media_urls;
      const arr = Array.isArray(mu) ? mu : (mu?.images || []);
      if (arr.length > 0) {
        const first = typeof arr[0] === 'string' ? arr[0] : arr[0]?.url || '';
        if (first) return this.resolveUrl(first);
      }
    } catch { /* ignore parse error */ }

    return '';
  }

  // ============================================================
  // MAIN: getAiResponse — agentic loop với function calling
  // ============================================================
  async getAiResponse(
    message: string,
    history: { role: 'user' | 'model'; parts: string }[],
  ): Promise<string> {
    if (!this.openai) {
      return 'Xin lỗi, dịch vụ AI hiện không khả dụng. Vui lòng thử lại sau.';
    }

    try {
      // --- Build message history (sliding window = 10 tin gần nhất) ---
      const historyMessages: OpenAI.Chat.ChatCompletionMessageParam[] = history
        .slice(-10)
        .map((h, idx, arr) => {
          const isLastUser = h.role === 'user' && idx === arr.length - 1;
          return {
            role: h.role === 'model' ? 'assistant' : 'user',
            // Append hidden reminder vào tin user cuối trong history
            content: isLastUser ? h.parts + HIDDEN_REMINDER : h.parts,
          } as OpenAI.Chat.ChatCompletionMessageParam;
        });

      // Tin nhắn hiện tại của user — append hidden reminder
      const userMessage = message + HIDDEN_REMINDER;

      // Messages gửi lên API (round 1)
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...historyMessages,
        { role: 'user', content: userMessage },
      ];

      // --- Round 1: Gọi Groq với tools ---
      let response = await this.openai.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages,
        tools: chatTools,
        tool_choice: 'auto',
        temperature: 0.2,
        max_tokens: 600,
      });

      this.logger.debug(
        `Groq round1: finish_reason=${response.choices[0].finish_reason}`,
      );

      // --- Agentic loop: xử lý tool_calls ---
      let loopCount = 0;
      while (
        response.choices[0].finish_reason === 'tool_calls' &&
        loopCount < 3 // Giới hạn số vòng để tránh vòng lặp vô tận
      ) {
        loopCount++;
        const assistantMsg = response.choices[0].message;
        const toolCalls = assistantMsg.tool_calls || [];

        // Thêm assistant message (có chứa tool_calls) vào history
        messages.push(assistantMsg as OpenAI.Chat.ChatCompletionMessageParam);

        // Chạy từng tool call song song
        const toolResults = await Promise.all(
          toolCalls.map(async (tc) => {
            // Cast về any để tránh lỗi union type từ Groq SDK
            const fn = (tc as any).function as { name: string; arguments: string };
            let args: Record<string, any> = {};
            try {
              args = JSON.parse(fn.arguments || '{}');
            } catch {
              args = {};
            }
            this.logger.log(`Executing tool: ${fn.name}(${JSON.stringify(args)})`);
            const result = await this.executeToolCall(fn.name, args);
            return { tool_call_id: tc.id, result };
          }),
        );

        // Append kết quả từng tool vào messages
        for (const { tool_call_id, result } of toolResults) {
          messages.push({
            role: 'tool',
            tool_call_id,
            content: result,
          } as OpenAI.Chat.ChatCompletionMessageParam);
        }

        // Round tiếp theo: Groq tổng hợp kết quả tool thành câu trả lời cuối
        response = await this.openai.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages,
          tools: chatTools,
          tool_choice: 'auto',
          temperature: 0.2,
          max_tokens: 600,
        });

        this.logger.debug(
          `Groq round${loopCount + 1}: finish_reason=${response.choices[0].finish_reason}`,
        );
      }

      const finalContent = response.choices[0].message.content;
      if (finalContent) {
        this.logger.log(`Groq OK after ${loopCount} tool round(s).`);
        return finalContent;
      }

      return 'Xin lỗi, mình không thể xử lý yêu cầu này. Bạn thử hỏi lại nhé!';
    } catch (error: any) {
      this.logger.error(`getAiResponse error: ${error?.message}`);

      // Fallback sang model nhỏ hơn nếu 70B lỗi
      try {
        const fallbackResponse = await this.openai.chat.completions.create({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: message + HIDDEN_REMINDER },
          ],
          temperature: 0.2,
          max_tokens: 400,
        });
        this.logger.warn('Fell back to llama-3.1-8b-instant');
        return fallbackResponse.choices[0].message.content || this.getMockResponse(message);
      } catch {
        return this.getMockResponse(message);
      }
    }
  }

  // ============================================================
  // MODERATION: kiểm tra nội dung độc hại trong chat livestream
  // ============================================================
  async moderateMessage(message: string): Promise<boolean> {
    if (!this.openai) return false;

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
Return exactly and only a JSON object: {"isToxic": true} if it is bad, or {"isToxic": false} if it is safe. Do not return any other text.`,
          },
          { role: 'user', content: message },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const resultStr = response.choices[0]?.message?.content;
      if (!resultStr) return false;
      const result = JSON.parse(resultStr);
      return result.isToxic === true;
    } catch (error: any) {
      this.logger.error(`Error in moderation AI: ${error?.message}`);
      return false;
    }
  }

  // ============================================================
  // FALLBACK: trả lời cứng khi API hoàn toàn không khả dụng
  // ============================================================
  private getMockResponse(message: string): string {
    const msg = message.toLowerCase();
    const related = [
      'chào', 'hi', 'hello', 'xin chào',
      'mô hình', 'figure', 'gundam', 'gunpla', 'blindbox', 'nendoroid',
      'giá', 'bao nhiêu', 'mua', 'đặt hàng', 'order', 'ship', 'giao hàng',
      'đơn hàng', 'tư vấn', 'figicore', 'preorder', 'đấu giá', 'ví',
    ];
    if (!related.some((k) => msg.includes(k))) {
      return 'Xin lỗi, câu hỏi này ngoài chuyên môn của mình. Mình chỉ hỗ trợ về sản phẩm và dịch vụ của FigiCore thôi ạ 😊';
    }
    if (msg.includes('chào') || msg.includes('hi') || msg.includes('hello')) {
      return 'Xin chào! ✨ Mình là tư vấn viên FigiCore, sẵn sàng hỗ trợ bạn về mô hình, Gundam, Blindbox. Bạn cần tìm gì ạ?';
    }
    if (msg.includes('blindbox')) {
      return 'Đây là chương trình đặc biệt từ FigiCore. Mua Blindbox bạn sẽ nhận phần thưởng ngẫu nhiên trực tiếp tại hệ thống ✨';
    }
    if (msg.includes('ví') || msg.includes('wallet')) {
      return 'Bạn có thể nạp tiền vào Ví FigiCore để mua sắm và đấu giá. Lưu ý: Tiền trong ví KHÔNG ĐƯỢC hoàn hay rút ra nhé!';
    }
    return 'Hệ thống AI đang bận, vui lòng thử lại sau. Mình sẵn sàng hỗ trợ bạn ngay khi kết nối trở lại 😊';
  }
}
