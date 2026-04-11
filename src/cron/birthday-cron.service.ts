import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class BirthdayCronService {
  private readonly logger = new Logger(BirthdayCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Runs daily at midnight.
   * Targets all users whose birth month matches the current month.
   *
   * For local testing, change to: @Cron(CronExpression.EVERY_MINUTE)
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleBirthdayVouchers() {
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentYear = now.getFullYear();

    this.logger.log(`[BirthdayCron] 🎂 Running birthday check for Month: ${currentMonth}...`);

    // ── Step 1: Find all users whose birthday is in the current month ──
    const usersInBirthMonth: Array<{
      user_id: number;
      full_name: string;
      email: string | null;
    }> = await this.prisma.$queryRaw`
      SELECT u.user_id, u.full_name, u.email
      FROM users u
      WHERE
        u.dob IS NOT NULL
        AND EXTRACT(MONTH FROM u.dob) = ${currentMonth}
        AND u.deleted_at IS NULL
        AND u.status_code = 'ACTIVE'
    `;

    if (!usersInBirthMonth.length) {
      this.logger.log('[BirthdayCron] No users with birthdays this month. Skipping.');
      return;
    }

    this.logger.log(`[BirthdayCron] Found ${usersInBirthMonth.length} user(s) in their birth month. Processing...`);

    // Promotion window: Today → last day of current month
    const today = new Date(currentYear, now.getMonth(), now.getDate(), 0, 0, 0);
    const monthEnd = new Date(currentYear, now.getMonth() + 1, 0, 23, 59, 59);

    for (const user of usersInBirthMonth) {
      try {
        await this._processBirthdayForUser(user, currentYear, today, monthEnd);
      } catch (err) {
        this.logger.error(`[BirthdayCron] Failed for user #${user.user_id}: ${err?.message}`);
      }
    }

    this.logger.log('[BirthdayCron] ✅ Done.');
  }

  private async _processBirthdayForUser(
    user: { user_id: number; full_name: string; email: string | null },
    year: number,
    startDate: Date,
    endDate: Date,
  ) {
    const voucherCode = `HPBD-${user.user_id}-${year}`;

    // ── Step 2: Duplicate Prevention — SKIP if voucher for this year already exists ──
    const alreadyExists = await this.prisma.promotions.findFirst({
      where: { code: voucherCode },
    });

    if (alreadyExists) {
      // User already received their birthday gift this year
      this.logger.debug(`[BirthdayCron] User #${user.user_id} already received ${voucherCode}. Skip.`);
      return;
    }

    // ── Step 3: Create the 10% discount promotion + assign to wallet (atomic) ──
    await this.prisma.$transaction(async (tx) => {
      // Create a unique promotion for this user
      const promotion = await tx.promotions.create({
        data: {
          code:               voucherCode,
          discount_value:      10,              // 10% discount
          discount_type:       'PERCENTAGE',
          max_discount_amount: 100000,          // Cap at 100,000 VND
          min_order_value:     0,               // No min order for birthday gift
          max_quantity:        1,               // Single-use
          collected_quantity:  1,
          is_public:           false,           // Private (not shown in collectible list)
          start_date:          startDate,
          end_date:            endDate,
        },
      });

      // Insert directly into user wallet as COLLECTED
      await tx.user_vouchers.create({
        data: {
          user_id:      user.user_id,
          promotion_id: promotion.promotion_id,
          status:       'COLLECTED', 
        },
      });

      this.logger.log(`[BirthdayCron] 🎁 Created & assigned ${voucherCode} → user #${user.user_id}`);
    });

    // ── Step 4: Send birthday email ──
    if (user.email) {
      this.mailService
        .sendBirthdayEmail(user.email, user.full_name, voucherCode, endDate)
        .catch(err =>
          this.logger.error(`[BirthdayCron] Email failed for ${user.email}: ${err?.message}`)
        );
    }
  }
}
