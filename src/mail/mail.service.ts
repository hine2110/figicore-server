import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption.service';

@Injectable()
export class MailService {
  constructor(
    private mailerService: MailerService,
    private configService: ConfigService,
    private notificationsService: NotificationsService,
    private prisma: PrismaService,
    private encryption: EncryptionService,
  ) { }


  private decryptUser(user: any) {
    if (!user) return null;
    const decrypted = { ...user };
    if (decrypted.phone) decrypted.phone = this.encryption.decrypt(decrypted.phone);
    if (decrypted.email) decrypted.email = this.encryption.decrypt(decrypted.email);
    if (decrypted.full_name) decrypted.full_name = this.encryption.decrypt(decrypted.full_name);
    return decrypted;
  }

  private decryptEmail(email: string): string {
    return this.encryption.decrypt(email);
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount).replace('₫', '').trim() + ' ₫';
  }

  async sendOrderConfirmation(user: any, order: any) {
    const decUser = this.decryptUser(user);
    const toEmail = decUser.email;
    try {
      const items = order.order_items.map(item => ({
        ...item,
        formattedPrice: this.formatCurrency(Number(item.unit_price || item.total_price / item.quantity)),
        product_variants: item.product_variants
      }));

      await this.mailerService.sendMail({
        to: toEmail,
        subject: `Order Confirmed #${order.order_code} - FigiCore`,
        template: './order-confirmation',
        context: {
          name: decUser.full_name,
          orderCode: order.order_code || order.order_id,
          formattedTotal: this.formatCurrency(Number(order.total_amount)),
          items: items,
          url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/customer/profile?tab=orders`
        },
      });
      console.log(`[MailService] Order confirmation sent to ${toEmail}`);

      // Sync Notification
      await this.notificationsService.create(
        decUser.user_id,
        'Order Confirmed! 🎉',
        `Your order #${order.order_code} has been confirmed successfully.`,
        '/customer/profile?tab=orders'
      );
    } catch (error) {
      console.error(`[MailService] Failed to send order confirmation to ${toEmail}`, error);
    }
  }

  async sendShippingUpdate(user: any, order: any) {
    const decUser = this.decryptUser(user);
    const toEmail = decUser.email;
    try {
      await this.mailerService.sendMail({
        to: toEmail,
        subject: `Your Order #${order.order_code} has been Shipped!`,
        template: './shipping-alert',
        context: {
          name: decUser.full_name,
          orderCode: order.order_code || order.order_id,
          trackingCode: order.shipments?.tracking_code || 'N/A',
        },
      });
      console.log(`[MailService] Shipping update sent to ${toEmail}`);

      // Sync Notification
      await this.notificationsService.create(
        decUser.user_id,
        'Order Shipped! 🚚',
        `Great news! Your order #${order.order_code} is on its way.`,
        '/customer/profile?tab=orders'
      );
    } catch (error) {
      console.error(`[MailService] Failed to send shipping update to ${toEmail}`, error);
    }
  }

  async sendDeliverySuccess(user: any, order: any, earnedPoints: number) {
    const decUser = this.decryptUser(user);
    const toEmail = decUser.email;
    try {
      await this.mailerService.sendMail({
        to: toEmail,
        subject: `Delivered Successfully! You earned +${earnedPoints} points`,
        template: './delivery-success',
        context: {
          name: decUser.full_name,
          orderCode: order.order_code || order.order_id,
          earnedPoints: earnedPoints,
          url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/customer/profile?tab=orders`
        },
      });
      console.log(`[MailService] Delivery success email sent to ${toEmail}`);

      // Sync Notification
      await this.notificationsService.create(
        decUser.user_id,
        'Order Delivered! ✅',
        `Order #${order.order_code} has been delivered. You earned ${earnedPoints} points!`,
        '/customer/profile?tab=orders'
      );
    } catch (error) {
      console.error(`[MailService] Failed to send delivery success email to ${toEmail}`, error);
    }
  }

  async sendOtpEmail(email: string, otp: string) {
    const toEmail = this.decryptEmail(email);
    try {
      await this.mailerService.sendMail({
        to: toEmail,
        subject: 'OTP Verification - FigiCore',
        template: './otp-email',
        context: {
          otp: otp,
        },
      });
      console.log(`[MailService] OTP sent to ${toEmail}`);
    } catch (error) {
      console.error(`[MailService] Failed to send OTP to ${toEmail}`, error);
    }
  }

  async sendPasswordResetEmail(email: string, name: string, resetLink: string) {
    const toEmail = this.decryptEmail(email);
    const toName = this.decryptEmail(name);
    try {
      await this.mailerService.sendMail({
        to: toEmail,
        subject: 'Password Reset Request - FigiCore',
        template: './password-reset',
        context: {
          name: toName,
          resetLink: resetLink,
        },
      });
      console.log(`[MailService] Password reset email sent to ${toEmail}`);
    } catch (error) {
      console.error(`[MailService] Failed to send password reset email to ${toEmail}`, error);
    }
  }

  async sendVerificationEmail(email: string, token: string) {
    const toEmail = this.decryptEmail(email);
    const url = `http://localhost:3000/auth/verify?token=${token}`;

    await this.mailerService.sendMail({
      to: toEmail,
      subject: 'Welcome to FigiCore! Confirm your Email',
      html: `
        <h3>Welcome to FigiCore</h3>
        <p>Please click the link below to confirm your email:</p>
        <p><a href="${url}">Confirm Email</a></p>
        <p>This link is valid for 24 hours.</p>
      `,
    });
  }

  async sendEmployeeActivation(to: string, tempPass: string, token: string, name: string) {
    const toEmail = this.decryptEmail(to);
    const toName = this.decryptEmail(name);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const activationLink = `${frontendUrl}/auth/activate?token=${token}`;

    await this.mailerService.sendMail({
      to: toEmail,
      from: process.env.MAIL_FROM, 
      subject: 'Activate Your FigiCore Employee Account',
      html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                    <h2 style="color: #111;">Welcome ${toName} to the FigiCore Team!</h2>
                    <p>Your account has been initialized. Below are your temporary login details:</p>
                    
                    <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Email:</strong> ${toEmail}</p>
                        <p style="margin: 5px 0;"><strong>Temporary Password:</strong> <span style="font-family: monospace; font-size: 16px; background: #eee; padding: 2px 6px; border-radius: 4px;">${tempPass}</span></p>
                    </div>
203: 
                    <p>Please click the button below to change your password and activate your account:</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${activationLink}" 
                           style="background-color: #000; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                           Activate Account
                        </a>
                    </div>
                    
                    <p style="color: #666; font-size: 14px;">This link will expire in 24 hours.</p>
                    <p style="color: #999; font-size: 12px; margin-top: 30px;">FigiCore System</p>
                </div>
            `,
    });
  }

  async sendStationVerificationEmail(email: string, stationName: string, confirmLink: string, cancelLink: string) {
    const toEmail = this.decryptEmail(email);
    await this.mailerService.sendMail({
      to: toEmail,
      subject: 'Station Registration Confirmation - FigiCore',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Station Registration Request</h2>
          <p>A request was made to register the station: <strong>${stationName}</strong></p>
          <p>If this was you, please confirm by clicking "Approve":</p>
          
          <div style="display: flex; gap: 20px; margin: 30px 0;">
             <a href="${confirmLink}" 
                style="background-color: #10B981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px;">
               Approve
             </a>
             <a href="${cancelLink}" 
                style="background-color: #EF4444; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px;">
               Deny & Delete
             </a>
          </div>

          <p style="color: #666;">If you didn't initiate this request, please click "Deny".</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px;">© 2026 FigiCore Security.</p>
        </div>
      `,
    });
  }
  async sendPreorderArrivalEmail(email: string, data: { customerName: string, productName: string, paymentLink: string, remainingAmount: number }) {
    const toEmail = this.decryptEmail(email);
    const toName = this.decryptEmail(data.customerName);
    try {
      await this.mailerService.sendMail({
        to: toEmail,
        subject: 'Pre-order Arrival Notification - FigiCore',
        template: './preorder-arrival', // Ensure this template exists or use HTML string if templates are not strictly checked
        context: {
          name: toName,
          productName: data.productName,
          paymentLink: data.paymentLink,
          formattedRemaining: this.formatCurrency(data.remainingAmount)
        },
        // Fallback HTML if template issue
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Good News, ${toName}!</h2>
                <p>Your pre-order for <strong>${data.productName}</strong> has arrived at our warehouse.</p>
                <p>Please finalize your payment to have it shipped.</p>
                <p><strong>Remaining Balance:</strong> ${this.formatCurrency(data.remainingAmount)}</p>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${data.paymentLink}" 
                       style="background-color: #000; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                       Pay Now
                    </a>
                </div>
                <p>This link is valid for 7 days.</p>
            </div>
        `
      });
      console.log(`[MailService] Pre-order arrival email sent to ${toEmail}`);

      // Sync Notification
      const targetUserResolved = await this.prisma.users.findFirst({
        where: { email: { equals: this.encryption.encryptDeterministic(toEmail) } }
      });
      if (targetUserResolved) {
        await this.notificationsService.create(
          targetUserResolved.user_id,
          'Your Pre-order is here! 📦',
          `The item '${data.productName}' has arrived. Please complete the remaining payment.`,
          '/customer/profile?tab=preorders'
        );
      }
    } catch (error) {
      console.error(`[MailService] Failed to send pre-order arrival email to ${toEmail}`, error);
    }
  }

  async sendAuctionWinEmail(user: any, auctionId: number, productName: string, paymentLink: string, amount: number) {
    const decUser = this.decryptUser(user);
    const toEmail = decUser.email;
    try {
      await this.mailerService.sendMail({
        to: toEmail,
        subject: `Congratulations! You won Auction #${auctionId} - FigiCore`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #f59e0b; padding: 20px; text-align: center;">
                    <h2 style="color: white; margin: 0;">You Won the Auction!</h2>
                </div>
                <div style="padding: 30px;">
                    <p>Hello <strong>${decUser.full_name}</strong>,</p>
                    <p>Congratulations on winning the auction for <strong>${productName}</strong>!</p>
                    <p>Total amount due (excluding shipping): <strong style="color: #ef4444; font-size: 18px;">${this.formatCurrency(amount)}</strong></p>
                    <p>Please complete your payment within <strong>24 hours</strong> to secure your purchase. After this deadline, your deposit will be forfeited and the purchase right will pass to the next highest bidder.</p>
                    
                    <div style="text-align: center; margin: 40px 0;">
                        <a href="${paymentLink}" 
                           style="background-color: #000; color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                           Pay Now
                        </a>
                    </div>
                    
                    <p style="color: #666; font-size: 14px;">Best regards,<br>The FigiCore Team</p>
                </div>
            </div>
        `
      });
      console.log(`[MailService] Auction win email sent to ${toEmail}`);

      // Sync Notification
      await this.notificationsService.create(
        decUser.user_id,
        'Auction Victory! 🏆',
        `Congratulations! You won the auction for '${productName}'. Please pay within 24h.`,
        '/customer/profile?tab=auctions'
      );
    } catch (error) {
      console.error(`[MailService] Failed to send auction win email to ${toEmail}`, error);
    }
  }

  async sendAuctionStandbyWinEmail(user: any, auctionId: number, productName: string, paymentLink: string, amount: number) {
    const decUser = this.decryptUser(user);
    const toEmail = decUser.email;
    try {
      await this.mailerService.sendMail({
        to: toEmail,
        subject: `Lucky You: Your Purchase Right for Auction #${auctionId} is Now Available! - FigiCore`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #3b82f6; padding: 20px; text-align: center;">
                    <h2 style="color: white; margin: 0;">Fortune Smiles Upon You!</h2>
                </div>
                <div style="padding: 30px;">
                    <p>Hello <strong>${decUser.full_name}</strong>,</p>
                    <p>In the auction for <strong>${productName}</strong> that you participated in, the initial winner has declined their purchase right or failed to pay on time.</p>
                    <p>Per our auction rules, the purchase right has been transferred to you at your highest bid price of: <strong style="color: #ef4444; font-size: 18px;">${this.formatCurrency(amount)}</strong></p>
                    <p>Please complete your payment within <strong>24 hours</strong> to add this exclusive item to your collection.</p>
                    
                    <div style="text-align: center; margin: 40px 0;">
                        <a href="${paymentLink}" 
                           style="background-color: #000; color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                           Pay Now
                        </a>
                    </div>
                    
                    <p style="color: #666; font-size: 14px;">Best regards,<br>The FigiCore Team</p>
                </div>
            </div>
        `
      });
      console.log(`[MailService] Auction standby win email sent to ${toEmail}`);
    } catch (error) {
      console.error(`[MailService] Failed to send auction standby win email to ${toEmail}`, error);
    }
  }

  // ─── Targeted Promotion Email ───────────────────────────────────────────────

  async sendTargetedPromotionEmail(user: { email: string; full_name: string }, promotion: any) {
    const toEmail = this.decryptEmail(user.email);
    const toName = this.decryptEmail(user.full_name);
    try {
      const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:5173');
      const collectUrl = `${frontendUrl}/customer/vouchers/collect/${promotion.promotion_id}`;

      const rankBadge = promotion.apply_rank_code
        ? `<span style="display:inline-block; background:#f59e0b; color:#fff; padding: 2px 10px; border-radius:12px; font-size:12px; font-weight:bold; margin-bottom:8px;">
             🏅 ${promotion.apply_rank_code} Exclusive
           </span><br>`
        : '';

      const discountText = promotion.discount_type === 'PERCENTAGE'
        ? `${promotion.discount_value}% OFF`
        : promotion.discount_type === 'FREE_SHIP'
          ? 'Free Shipping'
          : `${this.formatCurrency(Number(promotion.discount_value || 0))} OFF`;

      const expiryText = promotion.end_date
        ? `Valid until: <strong>${new Date(promotion.end_date).toLocaleDateString('en-GB')}</strong>`
        : 'No expiry — collect anytime!';

      await this.mailerService.sendMail({
        to: toEmail,
        subject: `🎁 New Voucher Available For You — FigiCore`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden;">
            <div style="background: linear-gradient(135deg, #111 0%, #333 100%); padding: 28px; text-align: center;">
              <h2 style="color: #fff; margin: 0; font-size: 22px;">🎁 A New Voucher Is Waiting For You!</h2>
            </div>

            <div style="padding: 30px;">
              <p>Hello <strong>${toName}</strong>,</p>
              <p>We have a special offer exclusively for you. Don't miss it!</p>

              <!-- Voucher Card -->
              <div style="border: 2px dashed #e5e7eb; border-radius: 10px; padding: 20px; margin: 24px 0; text-align: center; background: #fafafa;">
                ${rankBadge}
                <p style="font-size: 28px; font-weight: bold; color: #111; margin: 8px 0;">${discountText}</p>
                <p style="font-size: 13px; color: #6b7280; margin: 4px 0;">
                  Code: <span style="font-family: monospace; background: #f3f4f6; padding: 2px 8px; border-radius: 4px;">${promotion.code}</span>
                </p>
                ${promotion.min_order_value ? `<p style="font-size: 12px; color: #9ca3af; margin-top: 6px;">Minimum order: ${this.formatCurrency(Number(promotion.min_order_value))}</p>` : ''}
                <p style="font-size: 12px; color: #9ca3af; margin-top: 4px;">${expiryText}</p>
              </div>

              <div style="text-align: center; margin: 28px 0;">
                <a href="${collectUrl}"
                   style="background-color: #111; color: white; padding: 13px 36px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px;">
                   Collect Voucher Now
                </a>
              </div>

              <p style="color: #9ca3af; font-size: 12px;">
                This voucher was sent because your account qualifies for this promotion.
                Log in to FigiCore and add it to your wallet before it's gone!
              </p>
            </div>

            <div style="background: #f9fafb; padding: 16px; text-align: center;">
              <p style="color: #d1d5db; font-size: 11px; margin: 0;">© ${new Date().getFullYear()} FigiCore. All rights reserved.</p>
            </div>
          </div>
        `,
      });
      console.log(`[MailService] Targeted promo email sent to ${toEmail}`);
    } catch (error) {
      console.error(`[MailService] Failed to send targeted promo email to ${toEmail}`, error);
    }
  }

  // ─── Birthday Email ─────────────────────────────────────────────────────────

  async sendBirthdayEmail(email: string, fullName: string, voucherCode: string, validUntil: Date) {
    const toEmail = this.decryptEmail(email);
    const toName = this.decryptEmail(fullName);
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const walletUrl = `${frontendUrl}/customer/profile?tab=vouchers`;

      const formattedExpiry = new Intl.DateTimeFormat('en-US', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }).format(validUntil);

      await this.mailerService.sendMail({
        to: toEmail,
        subject: `🎂 Happy Birthday Month, ${toName}! A Gift from FigiCore`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border-radius: 12px; overflow: hidden; border: 1px solid #eaeaea;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #7c3aed 0%, #db2777 100%); padding: 36px; text-align: center;">
              <p style="font-size: 48px; margin: 0;">🎂</p>
              <h1 style="color: #fff; margin: 12px 0 4px; font-size: 26px;">Happy Birthday!</h1>
              <p style="color: rgba(255,255,255,0.85); margin: 0; font-size: 15px;">Celebrating your birthday month, ${toName}!</p>
            </div>

            <!-- Body -->
            <div style="padding: 32px;">
              <p style="color: #374151; font-size: 15px;">
                To celebrate your special month, FigiCore has <strong>automatically added a special voucher</strong> to your wallet. You can use it right away at checkout for <strong>Retail products</strong>!
              </p>

              <!-- Voucher Card -->
              <div style="border: 2px dashed #7c3aed; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center; background: #faf5ff;">
                <p style="font-size: 13px; color: #7c3aed; margin: 0 0 8px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">🎁 Birthday Gift</p>
                <p style="font-size: 28px; font-weight: bold; color: #111; margin: 8px 0;">10% OFF</p>
                <p style="font-size: 14px; color: #db2777; font-weight: bold; margin-bottom: 12px;">(Max 100.000₫ Discount)</p>
                <p style="font-size: 13px; color: #6b7280; margin: 4px 0;">
                  Code: <span style="font-family: monospace; background: #ede9fe; color: #7c3aed; padding: 3px 10px; border-radius: 6px; font-weight: bold;">${voucherCode}</span>
                </p>
                <p style="font-size: 12px; color: #9ca3af; margin-top: 10px;">
                  Expires: ${formattedExpiry} &nbsp;·&nbsp; Already in your wallet
                </p>
              </div>

              <div style="background: #fdf2f8; border-left: 4px solid #db2777; padding: 16px; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 14px; color: #9d174d;">
                   <strong>Note:</strong> Applicable for Retail items only (Excludes Blind Box & Pre-order). The voucher is already in your <strong>"Voucher Wallet"</strong>.
                </p>
              </div>

              <!-- CTA -->
              <div style="text-align: center; margin: 28px 0 16px;">
                <a href="${walletUrl}"
                   style="background: linear-gradient(135deg, #7c3aed, #db2777); color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block;">
                  Go to Voucher Wallet
                </a>
              </div>

              <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 24px;">
                Wishing you a wonderful birthday month filled with joy!<br>
                Team FigiCore 💜
              </p>
            </div>

            <!-- Footer -->
            <div style="background: #f9fafb; padding: 16px; text-align: center;">
              <p style="color: #d1d5db; font-size: 11px; margin: 0;">© ${new Date().getFullYear()} FigiCore — With love 💜</p>
            </div>
          </div>
        `,
      });
      console.log(`[MailService] Birthday email sent to ${toEmail}`);
    } catch (error) {
      console.error(`[MailService] Failed to send birthday email to ${toEmail}`, error);
    }
  }

  // ─── Weekly Rank Voucher Email ───────────────────────────────────────────────

  async sendWeeklyRankVoucherEmail(
    user: { email: string; full_name: string },
    promotion: any,
    rankCode: string,
    label: string,
  ) {
    const toEmail = user.email; // Already decrypted by caller
    const toName = user.full_name;
    try {
      const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:5173');
      const collectUrl = `${frontendUrl}/customer/home`;

      // Màu sắc badge theo rank
      const RANK_COLORS: Record<string, { bg: string; text: string; emoji: string }> = {
        BRONZE:  { bg: '#cd7f32', text: '#fff', emoji: '🥉' },
        SILVER:  { bg: '#94a3b8', text: '#fff', emoji: '🥈' },
        GOLD:    { bg: '#f59e0b', text: '#fff', emoji: '🥇' },
        DIAMOND: { bg: '#6366f1', text: '#fff', emoji: '💎' },
      };
      const rankStyle = RANK_COLORS[rankCode] || { bg: '#374151', text: '#fff', emoji: '🎫' };

      const discountDisplay = promotion.discount_type === 'FREE_SHIP'
        ? 'Free Shipping'
        : `${promotion.discount_value}% OFF`;

      const capDisplay = promotion.max_discount_amount
        ? `(Up to ${this.formatCurrency(Number(promotion.max_discount_amount))})`
        : '';

      const minOrderDisplay = promotion.min_order_value && Number(promotion.min_order_value) > 0
        ? `Min Order: ${this.formatCurrency(Number(promotion.min_order_value))}`
        : 'No minimum order';

      const expiryDisplay = promotion.end_date
        ? new Intl.DateTimeFormat('en-GB', {
            weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
          }).format(new Date(promotion.end_date))
        : 'No expiry';

      await this.mailerService.sendMail({
        to: toEmail,
        subject: `🎫 [${rankCode}] New Weekly Voucher Ready! — FigiCore`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border-radius: 12px; overflow: hidden; border: 1px solid #eaeaea;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #111 0%, #333 100%); padding: 32px; text-align: center;">
              <p style="font-size: 40px; margin: 0;">${rankStyle.emoji}</p>
              <h1 style="color: #fff; margin: 12px 0 4px; font-size: 24px;">New Weekly Voucher!</h1>
              <p style="color: rgba(255,255,255,0.8); margin: 0; font-size: 14px;">
                Exclusively for member rank:
                <span style="background:${rankStyle.bg}; color:${rankStyle.text}; padding:2px 10px; border-radius:12px; font-weight:bold; font-size:13px;">
                  ${rankStyle.emoji} ${rankCode}
                </span>
              </p>
            </div>

            <!-- Body -->
            <div style="padding: 32px;">
              <p style="color: #374151; font-size: 15px; margin-top: 0;">
                Hello <strong>${toName}</strong>,
              </p>
              <p style="color: #374151; font-size: 15px;">
                FigiCore has just released the <strong>Rank-Exclusive Voucher</strong> for this week.
                Make sure to collect it before it expires!
              </p>

              <!-- Voucher Card -->
              <div style="border: 2px dashed #e5e7eb; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center; background: #fafafa;">
                <span style="display:inline-block; background:${rankStyle.bg}; color:${rankStyle.text}; padding:3px 14px; border-radius:20px; font-size:12px; font-weight:bold; margin-bottom: 12px;">
                  ${rankStyle.emoji} ${rankCode} Exclusive
                </span>
                <p style="font-size: 30px; font-weight: bold; color: #111; margin: 8px 0;">${discountDisplay}</p>
                ${capDisplay ? `<p style="font-size: 14px; color: #6b7280; margin: 2px 0;">${capDisplay}</p>` : ''}
                <p style="font-size: 13px; color: #6b7280; margin: 8px 0;">
                  Code: <span style="font-family: monospace; background: #f3f4f6; padding: 2px 10px; border-radius: 6px; font-weight: bold;">${promotion.code}</span>
                </p>
                <p style="font-size: 12px; color: #9ca3af; margin: 6px 0;">${minOrderDisplay}</p>
                <p style="font-size: 12px; color: #ef4444; font-weight: bold; margin: 6px 0;">
                  ⏰ Expires: ${expiryDisplay}
                </p>
              </div>

              <!-- Note -->
              <div style="background: #f8fafc; border-left: 4px solid #cbd5e1; padding: 14px; border-radius: 4px; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 13px; color: #64748b;">
                  <strong>📌 Note:</strong> This voucher has <strong>not been automatically added</strong> to your wallet.
                  Click the button below to collect it manually. Applicable for Retail items only.
                </p>
              </div>

              <!-- CTA -->
              <div style="text-align: center; margin: 28px 0 16px;">
                <a href="${collectUrl}"
                   style="background-color: #111; color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block;">
                  Collect Voucher Now
                </a>
              </div>

              <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 24px;">
                Thank you for being part of FigiCore!<br>
                Team FigiCore 🖤
              </p>
            </div>

            <!-- Footer -->
            <div style="background: #f9fafb; padding: 16px; text-align: center;">
              <p style="color: #d1d5db; font-size: 11px; margin: 0;">© ${new Date().getFullYear()} FigiCore — With love 🖤</p>
            </div>
          </div>
        `,
      });
      console.log(`[MailService] Weekly rank voucher email sent to ${toEmail} (rank: ${rankCode})`);
    } catch (error) {
      console.error(`[MailService] Failed to send weekly rank voucher email to ${toEmail}`, error);
    }
  }

  // ─── Apology Voucher Email ───────────────────────────────────────────────

  async sendApologyEmail(
    user: { email: string; full_name: string },
    promotion: any,
  ) {
    const toEmail = user.email; // Already decrypted
    const toName = user.full_name;
    try {
      const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:5173');
      const walletUrl = `${frontendUrl}/customer/home`;

      await this.mailerService.sendMail({
        to: toEmail,
        subject: `🙏 A Sincere Apology from FigiCore — A Special Gift Just for You`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border-radius: 12px; overflow: hidden; border: 1px solid #eaeaea;">
            <div style="background: linear-gradient(135deg, #111 0%, #333 100%); padding: 32px; text-align: center;">
              <p style="font-size: 40px; margin: 0;">🙇🏻‍♂️</p>
              <h1 style="color: #fff; margin: 12px 0 4px; font-size: 24px;">Our Sincere Apologies</h1>
              <p style="color: rgba(255,255,255,0.8); margin: 0; font-size: 14px;">
                Thank you for your patience and for staying with us.
              </p>
            </div>

            <div style="padding: 32px;">
              <p style="color: #374151; font-size: 15px; margin-top: 0;">
                Hello <strong>${toName}</strong>,
              </p>
              <p style="color: #374151; font-size: 15px; line-height: 1.6;">
                On behalf of the entire FigiCore team, we would like to sincerely apologize for any inconvenience or errors you may have experienced with our service.
                Meeting your expectations is our top priority, and we are truly sorry for failing to do so this time.
              </p>
              <p style="color: #374151; font-size: 15px; line-height: 1.6;">
                As a token of our sincere apology, we have added a <strong>Private Voucher</strong> directly to your Voucher Wallet. No collection needed—simply select it during checkout:
              </p>

              <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
                <p style="margin: 0; color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Your Apology Voucher Code</p>
                <div style="font-family: monospace; font-size: 28px; font-weight: bold; color: #0f172a; margin: 8px 0; letter-spacing: 2px;">
                  ${promotion.code}
                </div>
                <div style="display: inline-block; background: #fee2e2; color: #b91c1c; padding: 4px 12px; border-radius: 16px; font-size: 13px; font-weight: bold; margin-bottom: 8px;">
                  Exclusively for you: 15% OFF (Up to ${this.formatCurrency(Number(promotion.max_discount_amount))})
                </div>
                <p style="margin: 0; color: #64748b; font-size: 13px;">
                  Applicable to all orders (Valid for 30 days)
                </p>
              </div>

              <div style="text-align: center; margin: 28px 0 16px;">
                <a href="${walletUrl}"
                   style="background: #111; color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block;">
                  Check Your Voucher Wallet
                </a>
              </div>

              <p style="color: #9ca3af; font-size: 13px; text-align: center; margin-top: 24px; line-height: 1.5;">
                We are committed to improving our service to provide you with a better experience in the future.<br>
                Best regards,<br>
                <strong>FigiCore Customer Care</strong>
              </p>
            </div>
          </div>
        `,
      });
      console.log(`[MailService] Apology email sent to ${toEmail}`);
    } catch (error) {
      console.error(`[MailService] Failed to send apology email to ${toEmail}`, error);
    }
  }
}