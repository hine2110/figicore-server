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
const SYSTEM_PROMPT = `Bạn là Figi — tư vấn viên bán hàng của FigiCore, một shop mô hình/figure/gunpla chuyên nghiệp. Hãy trò chuyện như một nhân viên thực sự — thân thiện, nhiệt tình, hiểu được cảm xúc của khách.

Xưng "mình", gọi "bạn". Ngắn gọn, tự nhiên, tối đa 3 câu + danh sách sản phẩm. KHÔNG được tiết lộ bạn là AI.

══ QUY TẮC TUYỆT ĐỐI ══

1. TOOL CALL BÍ MẬT: Khi gọi tool, TUYỆT ĐỐI không được hiển thị cú pháp tool ra màn hình. Khách chỉ thấy kết quả, không thấy "<function=...>" hay JSON định nghĩa tool.

2. KHÔNG BỊA SẢN PHẨM: Mọi tên sản phẩm, giá, link đều lấy từ tool. Link chuẩn: /customer/product/[id]. KHÔNG tự tạo link.

3. KẾT QUẢ KHÔNG TÌM THẤY: Nếu tool không tìm thấy, thông báo tự nhiên và hỏi thêm để tìm hướng khác. KHÔNG redirect khách đi xem catalog chung chung.

══ NGHIỆP VỤ ══

HÀNG BÁN LẺ (RETAIL) và BLINDBOX:
- Khách hỏi tìm/mua sản phẩm → Gọi tool search_retail_product ngay.
- Nếu không có kết quả: "Hiện mình chưa tìm thấy mẫu đó. Bạn muốn mình tìm theo từ khóa khác không?"
- BLINDBOX khái niệm: "Đây là chương trình đặc biệt của FigiCore, bạn sẽ nhận phần thưởng ngẫu nhiên trực tiếp tại hệ thống". KHÔNG tiết lộ bên trong.

HÀNG ĐẶT TRƯỚC (PRE-ORDER):
- Gọi tool get_preorder_info để tra cứu giá và slot.
- Quy trình: Chọn → Thanh toán cọc → Chờ hàng về → Nhận thông báo → Thanh toán nốt công nợ.
- Lưu ý: Tiền cọc không hoàn nếu hủy sau 24h.

ĐẤU GIÁ (AUCTION) — KHÔNG cần gọi tool, trả lời trực tiếp:
- Quy trình: Nạp cọc vào ví → Tìm phiên đấu giá trong Livestream → Đặt Bid → Thắng thì thanh toán nốt.
- Cảnh báo: "Nếu thắng mà không thanh toán sẽ mất toàn bộ cọc nhé!"
- Đường dẫn xem livestream: /customer/livestream

VÍ NỘI BỘ (WALLET):
- Hướng dẫn nạp tiền để mua sắm/đấu giá.
- Nhấn mạnh: "Tiền trong ví KHÔNG được hoàn hay rút ra nhé."

PHÍ VẬN CHUYỂN:
- Hệ thống tự động tính ở bước thanh toán. KHÔNG tự ước lượng hay hứa hẹn freeship.

══ FORMAT SẢN PHẨM (chỉ dùng data từ tool) ══
- ![Tên SP](url_ảnh) **Tên SP** | Giá: X | Tồn: Y | [Xem chi tiết](/customer/product/ID)`;


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
        const variants = await this.prisma.product_variants.findMany({
          where: {
            deleted_at: null,
            products: {
              status_code: 'ACTIVE',
              type_code: { in: ['RETAIL', 'BLINDBOX'] },
              name: { contains: keyword, mode: 'insensitive' },
            },
          },
          select: {
            variant_id: true,
            sku: true,
            price: true,
            stock_available: true,   // Tồn kho vật lý thực tế
            media_assets: true,      // Ảnh lấy từ variant media_assets (Json)
            products: {
              select: {
                product_id: true,
                name: true,
                type_code: true,
                media_urls: true,    // Ảnh product nằm trong media_urls (Json)
              },
            },
          },
          orderBy: { stock_available: 'desc' },
          take: 10,
        });

        if (variants.length === 0) {
          // Fallback: tìm kiếm mờ hơn — tách từ và thử từng từ
          const fallback = await this.prisma.product_variants.findMany({
            where: {
              deleted_at: null,
              products: {
                status_code: 'ACTIVE',
                type_code: { in: ['RETAIL', 'BLINDBOX'] },
                OR: keyword
                  .split(' ')
                  .filter((w) => w.length > 2)
                  .map((word) => ({ name: { contains: word, mode: 'insensitive' as any } })),
              },
            },
            select: {
              variant_id: true,
              price: true,
              stock_available: true,
              media_assets: true,
              products: { select: { product_id: true, name: true, type_code: true, media_urls: true } },
            },
            orderBy: { stock_available: 'desc' },
            take: 8,
          });

          if (fallback.length === 0) {
            return `[TOOL: search_retail_product] Không tìm thấy sản phẩm nào khớp với "${keyword}". Hãy hỏi khách muốn tìm theo từ khóa khác hoặc danh mục nào (ví dụ: Gunpla, Figure, Blindbox).`;
          }

          return (
            `[TOOL: search_retail_product] Không có kết quả chính xác cho "${keyword}", gợi ý sản phẩm liên quan:\n` +
            fallback
              .map((v) => {
                const stock = Number(v.stock_available ?? 0);
                const price = new Intl.NumberFormat('vi-VN').format(Number(v.price || 0)) + 'đ';
                const img = this.extractImageFromVariant(v);
                return `${img ? `![${v.products?.name}](${img}) ` : ''}**${v.products?.name}** (${v.products?.type_code}) | Giá: ${price} | Tồn kho: ${stock} | Link: /customer/product/${v.products?.product_id}`;
              })
              .join('\n')
          );
        }

        return (
          `[TOOL: search_retail_product] Tìm thấy ${variants.length} sản phẩm:\n` +
          variants
            .map((v) => {
              const stock = Number(v.stock_available ?? 0);
              const price = new Intl.NumberFormat('vi-VN').format(Number(v.price || 0)) + 'đ';
              const img = this.extractImageFromVariant(v);
              const stockLabel = stock <= 0 ? '⚠️ Hết hàng' : `${stock} cái`;
              return `${img ? `![${v.products?.name}](${img}) ` : ''}**${v.products?.name}** (${v.products?.type_code}) | Giá: ${price} | Tồn kho: ${stockLabel} | Link: /customer/product/${v.products?.product_id}`;
            })
            .join('\n')
        );
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
            products: { select: { product_id: true, name: true, media_urls: true } },
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
              return `${img ? `![${v.products?.name}](${img}) ` : ''}**${v.products?.name}** | Cọc: ${deposit} | Full: ${full} | ${slotLabel} | Link: /customer/product/${v.products?.product_id}`;
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
