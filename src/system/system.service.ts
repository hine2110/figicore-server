import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOpexDto } from './dto/update-opex.dto';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { UpdateWeeklyVoucherConfigDto } from './dto/weekly-voucher-config.dto';

@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);

  constructor(private prisma: PrismaService) {}

  private readonly defaultWeeklyVoucherConfig = {
    is_enabled: true,
    BRONZE:  { value: 0,  minOrder: 200000, maxCap: 20000,  quantity: 50 },
    SILVER:  { value: 2,  minOrder: 200000, maxCap: 70000,  quantity: 50 },
    GOLD:    { value: 5,  minOrder: 200000, maxCap: 100000, quantity: 50 },
    DIAMOND: { value: 10, minOrder: 200000, maxCap: 120000, quantity: 50 },
  };

  /**
   * Lấy cấu hình OPEX hiện tại.
   */
  async getOpexConfig() {
    const setting = await this.prisma.system_settings.findUnique({
      where: { key: 'OPEX_CONFIG' },
    });

    if (setting) {
      return setting.value as any;
    }

    // Default Fallback
    return {
      marketing_pct: 5,
      staff_pct: 10,
      storage_pct: 3,
      risk_pct: 2,
      tax_pct: 8,
    };
  }

  /**
   * Cập nhật cấu hình OPEX mới + Ghi Log + Kiểm tra Tổng 100%.
   */
  async updateOpexConfig(dto: UpdateOpexDto, userId: number) {
    // 1. Kiểm tra giới hạn 100%
    const total = Object.values(dto).reduce((sum, val) => sum + val, 0);
    if (total > 100) {
      throw new BadRequestException(`Tổng chi phí vận hành (${total}%) không được vượt quá 100%`);
    }

    // 2. Thực hiện trong Transaction để đảm bảo Update + Log đồng thời
    return await this.prisma.$transaction(async (tx) => {
      // Lấy giá trị cũ để ghi log
      const oldSetting = await tx.system_settings.findUnique({
        where: { key: 'OPEX_CONFIG' },
      });

      // Cập nhật hoặc tạo mới
      const newSetting = await tx.system_settings.upsert({
        where: { key: 'OPEX_CONFIG' },
        update: { value: dto as any, updated_at: new Date() },
        create: { 
          key: 'OPEX_CONFIG', 
          value: dto as any,
          description: 'Cấu hình chi phí vận hành (OPEX) cho AI Analytics' 
        },
      });

      // Ghi Log lịch sử biến động
      await tx.system_settings_logs.create({
        data: {
          key: 'OPEX_CONFIG',
          old_value: oldSetting ? (oldSetting.value as any) : null,
          new_value: dto as any,
          user_id: userId,
        },
      });

      this.logger.log(`OPEX Config updated by User #${userId}. Total: ${total}%`);
      return newSetting.value;
    });
  }

  // --- BANNER MANAGEMENT ---

  async getBanners(onlyActive = true) {
    return await this.prisma.system_banners.findMany({
      where: onlyActive ? { is_active: true } : {},
      orderBy: { sort_order: 'asc' },
    });
  }

  async createBanner(dto: CreateBannerDto) {
    return await this.prisma.system_banners.create({
      data: dto,
    });
  }

  async updateBanner(id: number, dto: UpdateBannerDto) {
    return await this.prisma.system_banners.update({
      where: { banner_id: id },
      data: dto,
    });
  }

  async deleteBanner(id: number) {
    return await this.prisma.system_banners.delete({
      where: { banner_id: id },
    });
  }

  async toggleBannerStatus(id: number) {
    const banner = await this.prisma.system_banners.findUnique({
      where: { banner_id: id },
      select: { is_active: true },
    });

    if (!banner) throw new BadRequestException('Banner không tồn tại');

    return await this.prisma.system_banners.update({
      where: { banner_id: id },
      data: { is_active: !banner.is_active },
    });
  }

  // --- Weekly Voucher Config ---

  /**
   * Lấy cấu hình Weekly Voucher hiện tại
   */
  async getWeeklyVoucherConfig() {
    const setting = await this.prisma.system_settings.findUnique({
      where: { key: 'WEEKLY_VOUCHER_CONFIG' },
    });

    if (setting) {
      return setting.value as unknown as typeof this.defaultWeeklyVoucherConfig;
    }

    return this.defaultWeeklyVoucherConfig;
  }

  /**
   * Cập nhật cấu hình Weekly Voucher
   */
  async updateWeeklyVoucherConfig(dto: UpdateWeeklyVoucherConfigDto, userId: number) {
    return await this.prisma.$transaction(async (tx) => {
      const oldSetting = await tx.system_settings.findUnique({
        where: { key: 'WEEKLY_VOUCHER_CONFIG' },
      });

      const newSetting = await tx.system_settings.upsert({
        where: { key: 'WEEKLY_VOUCHER_CONFIG' },
        update: { value: dto as any, updated_at: new Date() },
        create: {
          key: 'WEEKLY_VOUCHER_CONFIG',
          value: dto as any,
          description: 'Cấu hình tự động phát Weekly Voucher cho Rank Members',
        },
      });

      await tx.system_settings_logs.create({
        data: {
          key: 'WEEKLY_VOUCHER_CONFIG',
          old_value: oldSetting ? (oldSetting.value as any) : null,
          new_value: dto as any,
          user_id: userId,
        },
      });

      this.logger.log(`Weekly Voucher Config updated by User #${userId}. Enabled: ${dto.is_enabled}`);
      return newSetting.value;
    });
  }
}
