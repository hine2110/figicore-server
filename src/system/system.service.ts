import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOpexDto } from './dto/update-opex.dto';

@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);

  constructor(private prisma: PrismaService) {}

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
}
