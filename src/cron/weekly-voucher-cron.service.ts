import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { EncryptionService } from '../common/encryption.service';

import { SystemService } from '../system/system.service';

@Injectable()
export class WeeklyVoucherCronService {
  private readonly logger = new Logger(WeeklyVoucherCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly encryption: EncryptionService,
    private readonly systemService: SystemService,
  ) {}

  /**
   * Runs at 00:01 every Monday.
   * Creates 4 vouchers for 4 ranks, and sends notification emails for customers to collect manually.
   * Dev side: can be triggered via triggerManually().
   */
  @Cron('1 0 * * 1')
  async handleWeeklyVouchers() {
    this.logger.log('[WeeklyVoucherCron] 🎫 Fetching config...');
    const config = await this.systemService.getWeeklyVoucherConfig();

    if (!config.is_enabled) {
      this.logger.log('[WeeklyVoucherCron] 🛑 Weekly voucher generation is DISABLED in settings. Skipping.');
      return;
    }

    this.logger.log('[WeeklyVoucherCron] 🎫 Starting weekly voucher generation...');

    const now = new Date();
    const { startDate, endDate, weekNumber, year } = this._computeWeekWindow(now);

    this.logger.log(
      `[WeeklyVoucherCron] Week #${weekNumber}/${year} | ${startDate.toISOString()} → ${endDate.toISOString()}`,
    );

    const ranksToProcess = [
      { rank: 'BRONZE', data: config.BRONZE, type: 'FREE_SHIP' },
      { rank: 'SILVER', data: config.SILVER, type: 'PERCENTAGE' },
      { rank: 'GOLD', data: config.GOLD, type: 'PERCENTAGE' },
      { rank: 'DIAMOND', data: config.DIAMOND, type: 'PERCENTAGE' },
    ];

    for (const rankInfo of ranksToProcess) {
      try {
        await this._processRankVoucher(
          {
            rank: rankInfo.rank,
            discount_type: rankInfo.type,
            discount_value: rankInfo.data.value,
            min_order_value: rankInfo.data.minOrder,
            max_discount_amount: rankInfo.data.maxCap,
            quantity: rankInfo.data.quantity,
            label: rankInfo.type === 'FREE_SHIP'
              ? `Free Shipping (Max ${rankInfo.data.maxCap}đ)`
              : `Discount ${rankInfo.data.value}% (Max ${rankInfo.data.maxCap}đ)`,
          },
          weekNumber,
          year,
          startDate,
          endDate,
        );
      } catch (err) {
        this.logger.error(
          `[WeeklyVoucherCron] Failed for rank ${rankInfo.rank}: ${err?.message}`,
          err,
        );
      }
    }

    this.logger.log('[WeeklyVoucherCron] ✅ Weekly voucher generation complete.');
  }

  /**
   * Used for manual testing — called via controller or during development.
   */
  async triggerManually() {
    this.logger.log('[WeeklyVoucherCron] 🔧 Manual trigger initiated.');
    await this.handleWeeklyVouchers();
    return { success: true, message: 'Weekly voucher cron triggered manually.' };
  }

  // ─────────────────────────────────────────────────────────────────────────────

  private async _processRankVoucher(
    config: {
      rank: string;
      discount_type: string;
      discount_value: number;
      min_order_value: number;
      max_discount_amount: number;
      quantity: number;
      label: string;
    },
    weekNumber: number,
    year: number,
    startDate: Date,
    endDate: Date,
  ) {
    const code = `WEEKLY-${config.rank}-W${weekNumber}-${year}`;

    // ── 1. Duplicate Prevention ──
    const alreadyExists = await this.prisma.promotions.findFirst({
      where: { code },
    });

    if (alreadyExists) {
      this.logger.debug(`[WeeklyVoucherCron] ${code} already exists. Skipping.`);
      return;
    }

    // ── 2. Create Promotion (public, requires manual collection) ──
    const promotion = await this.prisma.promotions.create({
      data: {
        code,
        discount_type: config.discount_type,
        discount_value: config.discount_value,
        max_discount_amount: config.max_discount_amount,
        min_order_value: config.min_order_value,
        apply_rank_code: config.rank,
        is_public: true,          // Visible in voucher list for collection
        is_active: true,
        max_quantity: config.quantity, // Read from config
        collected_quantity: 0,
        start_date: startDate,
        end_date: endDate,
      },
    });

    this.logger.log(
      `[WeeklyVoucherCron] ✅ Created ${code} (ID: ${promotion.promotion_id}) for rank ${config.rank}`,
    );

    // ── 3. Fire-and-forget: Send notification emails to the target rank ──
    this._dispatchRankEmails(promotion, config.rank, config.label).catch((err) =>
      this.logger.error(
        `[WeeklyVoucherCron] Email dispatch failed for ${code}: ${err?.message}`,
      ),
    );
  }

  /**
   * Finds all customers with the corresponding rank and sends notification emails.
   * Runs as fire-and-forget to avoid blocking the cron job.
   */
  private async _dispatchRankEmails(
    promotion: any,
    rankCode: string,
    label: string,
  ) {
    this.logger.log(
      `[WeeklyVoucherCron] Dispatching emails for rank ${rankCode}...`,
    );

    const customers = await this.prisma.customers.findMany({
      where: {
        current_rank_code: rankCode,
        users: { deleted_at: null, status_code: 'ACTIVE' },
      },
      include: {
        users: { select: { user_id: true, email: true, full_name: true } },
      },
    });

    const withEmails = customers.filter((c) => c.users?.email);

    this.logger.log(
      `[WeeklyVoucherCron] Found ${withEmails.length} customer(s) with rank ${rankCode} to notify.`,
    );

    for (const customer of withEmails) {
      try {
        const email = this.encryption.decrypt(customer.users!.email!);
        const name = this.encryption.decrypt(customer.users!.full_name!);

        await this.mailService.sendWeeklyRankVoucherEmail(
          { email, full_name: name },
          promotion,
          rankCode,
          label,
        );
      } catch (err) {
        this.logger.error(
          `[WeeklyVoucherCron] Failed to send email to user #${customer.user_id}: ${err?.message}`,
        );
      }
    }

    this.logger.log(
      `[WeeklyVoucherCron] Email dispatch done for rank ${rankCode}.`,
    );
  }

  /**
   * Computes start (Monday 00:01) and end (Saturday 23:59:59) for the current week.
   */
  private _computeWeekWindow(now: Date) {
    // ISO week: Thứ 2 = dayOfWeek 1
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const distanceToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Subtract days to get to Monday

    const monday = new Date(now);
    monday.setDate(now.getDate() + distanceToMonday);
    monday.setHours(0, 1, 0, 0); // 00:01

    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5); // Saturday
    saturday.setHours(23, 59, 59, 999); // 23:59:59

    // ISO week number
    const jan1 = new Date(now.getFullYear(), 0, 1);
    const weekNumber = Math.ceil(
      ((now.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7,
    );

    return {
      startDate: monday,
      endDate: saturday,
      weekNumber,
      year: now.getFullYear(),
    };
  }
}
