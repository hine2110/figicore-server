import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import { tavily } from '@tavily/core';

// Brands đã biết — tìm thông tin cụ thể
const DEFAULT_BRANDS = [
  'Bandai',
  'Moshow',
  'Pop Mart',
  'Good Smile Company',
  'Kotobukiya',
  'Hot Toys',
  'Aniplex',
  'MegaHouse',
];

// Queries khám phá ngành — tìm studio/hãng MỚI chưa có trong danh sách
// Đặc biệt tập trung vào các studio resin Trung Quốc đang nổi lên
const DISCOVERY_QUERIES = [
  'new Chinese resin figure studio release announcement {year}',
  'China garage kit figure manufacturer press release {year}',
  'Chinese collectible figure studio exhibition {year} new',
  'new blind box manufacturer China {year} official announcement',
  'independent figure studio resin statue {year} press release',
];

@Injectable()
export class MarketIntelligenceService {
  private readonly logger = new Logger(MarketIntelligenceService.name);
  private groq: Groq;
  private tavilyClient: ReturnType<typeof tavily>;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    const groqKey = this.configService.get<string>('GROQ_API_KEY');
    if (!groqKey) throw new Error('GROQ_API_KEY missing');
    this.groq = new Groq({ apiKey: groqKey });

    const tavilyKey = this.configService.get<string>('TAVILY_API_KEY');
    if (!tavilyKey) throw new Error('TAVILY_API_KEY missing');
    this.tavilyClient = tavily({ apiKey: tavilyKey });
  }

  /**
   * Bước 1: Dùng Tavily để tìm kiếm thông tin sản phẩm mới từ các hãng
   * + Industry-wide discovery để tìm studio/hãng mới chưa có trong danh sách
   */
  async searchBrandReleases(brands: string[]): Promise<any[]> {
    const allResults: any[] = [];

    // Luôn dùng năm hiện tại + năm tới để không bị stale
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;

    // Danh sách domain cần loại bỏ hoàn toàn (Cộng đồng rác và CÁC TRANG BÁN LẺ COMPETITORS)
    const BLOCKED_DOMAINS = [
      // Forums / Noisy Social
      'tiktok.com',
      'reddit.com',
      'pinterest.com',
      'tumblr.com',
      'discord.com',
      'twitch.tv',
      // Competitor Retailers / E-commerce
      'amazon.com', 'amazon.co.jp',
      'ebay.com',
      'aliexpress.com',
      'amiami.com',
      '1999.co.jp', // Hobby Search
      'bigbadtoystore.com',
      'entertainmentearth.com',
      'sugotoys.com.au',
      'specfictionshop.com',
      'hlj.com',
      'solarisjapan.com',
      'nin-nin-game.com',
      'shopee.vn', 'shopee.com',
      'lazada.vn', 'lazada.com',
      'tokopedia.com',
      'carousell.com',
      'carousell.sg',
      'mercari.com',
    ];

    const searchOptions = {
      searchDepth: 'basic' as const,
      maxResults: 5,
      includeAnswer: false,
      excludeDomains: BLOCKED_DOMAINS,
    };

    // --- PHẦN 1: Brand-specific search (hãng đã biết) ---
    for (const brand of brands) {
      try {
        const queries = [
          `${brand} new figure ${currentYear} ${nextYear} press release announcement`,
          `${brand} upcoming collectible toy ${currentYear} official exhibition`,
        ];

        for (const query of queries) {
          this.logger.log(`[Tavily][Brand] Searching: "${query}"`);
          const response = await this.tavilyClient.search(query, searchOptions as any);

          if (response.results?.length > 0) {
            allResults.push(
              ...response.results.map((r: any) => ({
                brand,             // Gán brand đã biết
                title: r.title,
                url: r.url,
                content: r.content?.substring(0, 600) || '',
                score: r.score || 0,
                searchType: 'brand-specific',
              })),
            );
          }
        }
      } catch (err) {
        this.logger.warn(`[Tavily] Search failed for brand "${brand}":`, err.message);
      }
    }

    // --- PHẦN 2: Industry-wide discovery (tìm hãng/studio MỚI) ---
    for (const queryTemplate of DISCOVERY_QUERIES) {
      try {
        const query = queryTemplate
          .replace('{year}', String(currentYear))
          .replace('{year}', String(currentYear)); // replace both occurrences

        this.logger.log(`[Tavily][Discovery] Searching: "${query}"`);
        const response = await this.tavilyClient.search(query, searchOptions as any);

        if (response.results?.length > 0) {
          allResults.push(
            ...response.results.map((r: any) => ({
              brand: 'UNKNOWN',    // Để AI tự xác định brand từ nội dung
              title: r.title,
              url: r.url,
              content: r.content?.substring(0, 600) || '',
              score: r.score || 0,
              searchType: 'discovery',
            })),
          );
        }
      } catch (err) {
        this.logger.warn(`[Tavily][Discovery] Search failed:`, err.message);
      }
    }

    // Lọc theo điểm relevance, loại bỏ duplicate URL, và double-check domain
    const seen = new Set<string>();
    return allResults
      .filter((r) => {
        if (seen.has(r.url)) return false;
        seen.add(r.url);

        // Double-check: Loại bỏ nếu URL vẫn chứa domain bị cấm
        const isSocialMedia = BLOCKED_DOMAINS.some(domain => r.url.includes(domain));
        if (isSocialMedia) {
          this.logger.warn(`[Tavily] Filtered social media URL: ${r.url}`);
          return false;
        }

        return r.score > 0.3;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 40); // 30 brand-specific + 10 discovery
  }

  /**
   * Bước 2: Dùng Groq AI để phân tích và cấu trúc hóa kết quả search
   */
  async extractWithAI(rawResults: any[]): Promise<any[]> {
    if (rawResults.length === 0) return [];

    const currentYear = new Date().getFullYear();
    const formattedResults = rawResults
      .map((r, i) => `[${i + 1}] BRAND: ${r.brand} | TYPE: ${r.searchType || 'brand-specific'} | TITLE: ${r.title} | URL: ${r.url}\nCONTENT: ${r.content}`)
      .join('\n\n---\n\n');

    try {
      const completion = await this.groq.chat.completions.create({
        model: this.configService.get<string>('GROQ_MODEL', 'llama3-8b-8192'),
        messages: [
          {
            role: 'system',
            content: `
              You are a product intelligence analyst for a collectible toy and figure retail business in Vietnam.
              Current year: ${currentYear}.
              
              Task: Analyze web search results and extract NEW or UPCOMING product releases from toy/figure manufacturers.
              Results include two types — "brand-specific" (known brands like Bandai, Hot Toys) and "discovery" (finding NEW studios not yet in our system).
              
              EXTRACTION RULES:
              - Only extract REAL products with specific names from OFFICIAL announcements, press releases, or official social media posts.
              - EXTREMELY IMPORTANT (NO RETAIL/SELLERS): REJECT and IGNORE any search results that are retail store listings, pre-order pages from shops, or e-commerce platforms. We ONLY want manufacturer announcements.
              - EXTREMELY IMPORTANT (SOCIAL MEDIA STRICT FILTER): If the source is a social media platform (Facebook, Instagram, X/Twitter), it MUST be the OFFICIAL page of the manufacturer/studio. STRICTLY REJECT any personal accounts, individual sellers, community groups, fan pages, or third-party retailer pages on social media.
              - EXTREMELY IMPORTANT (DEEP LINKS ONLY): The source_url MUST point directly to the SPECIFIC article, post, or product announcement page. NEVER return a generic homepage URL.
              - Status: "UPCOMING" if not yet released, "RELEASED" if already available, "RUMORED" if unconfirmed.
              - Confidence:
                  "HIGH" = from official brand website or official brand's verified social media page.
                  "MEDIUM" = from specialized hobby/news sites reporting on events (toyark.com, myfigurecollection.net).
                  "LOW" = from general blogs or unverified sources.
              - Category: Choose from "Figure", "Blind Box", "Statue", "Resin", "Diecast", "Plush", "Other".
              - release_date: Use the ACTUAL year from the content (e.g., "Q3/${currentYear}"). NEVER invent dates. Use null if unknown.
              - Skip: Accessories, parts, re-releases of very old products, non-physical items.
              - product_name: Include full product line and variant name.
              
              SPECIAL RULE for TYPE="discovery" results (BRAND="UNKNOWN"):
              - Extract the REAL studio/manufacturer name from the content (e.g., "Infinity Studio", "XM Studios", "YZ Factory", "Sideshow").
              - If the content mentions a Chinese resin/garage kit studio, capture its name as brand.
              - If no specific studio name found, use "Independent Studio" as brand.
              
              RETURN FORMAT (strict JSON):
              {
                "products": [
                  {
                    "brand": string,
                    "product_name": string,
                    "description": string (1-2 sentences),
                    "category": string,
                    "status": "UPCOMING" | "RELEASED" | "RUMORED",
                    "release_date": string | null,
                    "source_url": string,
                    "source_title": string,
                    "confidence": "HIGH" | "MEDIUM" | "LOW"
                  }
                ]
              }
              
              Return an empty products array if no relevant products are found.
            `,
          },
          {
            role: 'user',
            content: `Analyze these search results and extract product intelligence:\n\n${formattedResults}`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) return [];

      const data = JSON.parse(responseText);
      const products = data.products || [];

      // Double-check: Lọc bỏ sản phẩm mà AI bịa URL (URL không nằm trong rawResults)
      const validUrls = new Set(rawResults.map(r => r.url));
      return products.filter((p: any) => {
        if (!p.source_url || !validUrls.has(p.source_url)) {
          this.logger.warn(`[AI] Filtered hallucinated URL: ${p.source_url}`);
          return false;
        }
        return true;
      });
    } catch (err) {
      this.logger.error('[Groq] Market Intel extraction failed:', err.message);
      return [];
    }
  }


  /**
   * Bước 3: Orchestrator — Scan toàn bộ thị trường
   */
  async triggerMarketScan(): Promise<{ scanned: number; saved: number; brands: string[] }> {
    this.logger.log('[MarketIntel] Starting market scan...');

    // Lấy danh sách brands từ system_settings hoặc dùng default
    let brands = DEFAULT_BRANDS;
    try {
      const setting = await this.prisma.system_settings.findUnique({
        where: { key: 'MARKET_INTEL_BRANDS' },
      });
      if (setting && Array.isArray(setting.value)) {
        brands = setting.value as string[];
      }
    } catch {
      // Dùng default
    }

    // Bước 1: Tìm kiếm
    const rawResults = await this.searchBrandReleases(brands);
    this.logger.log(`[MarketIntel] Found ${rawResults.length} raw results.`);

    // Bước 2: AI phân tích
    const products = await this.extractWithAI(rawResults);
    this.logger.log(`[MarketIntel] AI extracted ${products.length} products.`);

    if (products.length === 0) {
      return { scanned: rawResults.length, saved: 0, brands };
    }

    // Bước 3: XÓA SẠCH kết quả cũ rồi INSERT kết quả mới hoàn toàn
    // Mỗi lần scan = fresh results, không cộng dồn
    this.logger.log('[MarketIntel] Clearing old records before inserting fresh results...');
    const deleted = await (this.prisma as any).market_intel.deleteMany({});
    this.logger.log(`[MarketIntel] Deleted ${deleted.count} old records.`);

    let saved = 0;
    for (const product of products) {
      try {
        await (this.prisma as any).market_intel.create({
          data: {
            brand: product.brand || 'Unknown',
            product_name: product.product_name || 'Unknown Product',
            description: product.description,
            category: product.category,
            status: product.status || 'UPCOMING',
            release_date: product.release_date,
            source_url: product.source_url || '',
            source_title: product.source_title,
            confidence: product.confidence || 'LOW',
          },
        });
        saved++;
      } catch (err) {
        this.logger.warn(`[MarketIntel] Failed to save product "${product.product_name}":`, err.message);
      }
    }


    this.logger.log(`[MarketIntel] Scan complete. Saved ${saved} new records.`);
    return { scanned: rawResults.length, saved, brands };
  }

  /**
   * Đọc danh sách Market Intel từ DB
   */
  async getMarketIntel(query: {
    brand?: string;
    status?: string;
    category?: string;
    page?: string;
    limit?: string;
  }) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.brand && query.brand !== 'all') where.brand = query.brand;
    if (query.status && query.status !== 'all') where.status = query.status.toUpperCase();
    if (query.category && query.category !== 'all') where.category = query.category;

    const [data, total] = await Promise.all([
      (this.prisma as any).market_intel.findMany({
        where,
        orderBy: [{ confidence: 'asc' }, { scanned_at: 'desc' }],
        skip,
        take: limit,
      }),
      (this.prisma as any).market_intel.count({ where }),
    ]);

    // Lấy danh sách brands unique để hiện filter chips
    const brands = await (this.prisma as any).market_intel.findMany({
      select: { brand: true },
      distinct: ['brand'],
      orderBy: { brand: 'asc' },
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        lastScanned: data[0]?.scanned_at || null,
      },
      brands: brands.map((b: any) => b.brand),
    };
  }
}
