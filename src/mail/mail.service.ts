import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  constructor(
    private mailerService: MailerService,
    private configService: ConfigService,
  ) { }


  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount).replace('₫', '').trim() + ' ₫';
  }

  async sendOrderConfirmation(user: any, order: any) {
    try {
      const items = order.order_items.map(item => ({
        ...item,
        formattedPrice: this.formatCurrency(Number(item.unit_price || item.total_price / item.quantity)),
        product_variants: item.product_variants
      }));

      await this.mailerService.sendMail({
        to: user.email,
        subject: `Order Confirmed #${order.order_code} - FigiCore`,
        template: './order-confirmation',
        context: {
          name: user.full_name,
          orderCode: order.order_code || order.order_id,
          formattedTotal: this.formatCurrency(Number(order.total_amount)),
          items: items,
          url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/customer/profile?tab=orders`
        },
      });
      console.log(`[MailService] Order confirmation sent to ${user.email}`);
    } catch (error) {
      console.error(`[MailService] Failed to send order confirmation to ${user.email}`, error);
    }
  }

  async sendShippingUpdate(user: any, order: any) {
    try {
      await this.mailerService.sendMail({
        to: user.email,
        subject: `Your Order #${order.order_code} has been Shipped!`,
        template: './shipping-alert',
        context: {
          name: user.full_name,
          orderCode: order.order_code || order.order_id,
          trackingCode: order.shipments?.tracking_code || 'N/A',
        },
      });
      console.log(`[MailService] Shipping update sent to ${user.email}`);
    } catch (error) {
      console.error(`[MailService] Failed to send shipping update to ${user.email}`, error);
    }
  }

  async sendDeliverySuccess(user: any, order: any, earnedPoints: number) {
    try {
      await this.mailerService.sendMail({
        to: user.email,
        subject: `Delivered Successfully! You earned +${earnedPoints} points`,
        template: './delivery-success',
        context: {
          name: user.full_name,
          orderCode: order.order_code || order.order_id,
          earnedPoints: earnedPoints,
          url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/customer/profile?tab=orders`
        },
      });
      console.log(`[MailService] Delivery success email sent to ${user.email}`);
    } catch (error) {
      console.error(`[MailService] Failed to send delivery success email to ${user.email}`, error);
    }
  }

  async sendOtpEmail(email: string, otp: string) {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'OTP Verification - FigiCore',
        template: './otp-email',
        context: {
          otp: otp,
        },
      });
      console.log(`[MailService] OTP sent to ${email}`);
    } catch (error) {
      console.error(`[MailService] Failed to send OTP to ${email}`, error);
    }
  }

  async sendPasswordResetEmail(email: string, name: string, resetLink: string) {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Password Reset Request - FigiCore',
        template: './password-reset',
        context: {
          name: name,
          resetLink: resetLink,
        },
      });
      console.log(`[MailService] Password reset email sent to ${email}`);
    } catch (error) {
      console.error(`[MailService] Failed to send password reset email to ${email}`, error);
    }
  }

  async sendVerificationEmail(email: string, token: string) {
    const url = `http://localhost:3000/auth/verify?token=${token}`;

    await this.mailerService.sendMail({
      to: email,
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
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const activationLink = `${frontendUrl}/auth/activate?token=${token}`;

    await this.mailerService.sendMail({
      to: to,
      from: process.env.MAIL_FROM, 
      subject: 'Activate Your FigiCore Employee Account',
      html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                    <h2 style="color: #111;">Welcome ${name} to the FigiCore Team!</h2>
                    <p>Your account has been initialized. Below are your temporary login details:</p>
                    
                    <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Email:</strong> ${to}</p>
                        <p style="margin: 5px 0;"><strong>Temporary Password:</strong> <span style="font-family: monospace; font-size: 16px; background: #eee; padding: 2px 6px; border-radius: 4px;">${tempPass}</span></p>
                    </div>

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
    await this.mailerService.sendMail({
      to: email,
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
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Pre-order Arrival Notification - FigiCore',
        template: './preorder-arrival', // Ensure this template exists or use HTML string if templates are not strictly checked
        context: {
          name: data.customerName,
          productName: data.productName,
          paymentLink: data.paymentLink,
          formattedRemaining: this.formatCurrency(data.remainingAmount)
        },
        // Fallback HTML if template issue
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Good News, ${data.customerName}!</h2>
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
      console.log(`[MailService] Pre-order arrival email sent to ${email}`);
    } catch (error) {
      console.error(`[MailService] Failed to send pre-order arrival email to ${email}`, error);
    }
  }

  async sendAuctionWinEmail(user: any, auctionId: number, productName: string, paymentLink: string, amount: number) {
    try {
      await this.mailerService.sendMail({
        to: user.email,
        subject: `Congratulations! You won Auction #${auctionId} - FigiCore`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #f59e0b; padding: 20px; text-align: center;">
                    <h2 style="color: white; margin: 0;">You Won the Auction!</h2>
                </div>
                <div style="padding: 30px;">
                    <p>Hello <strong>${user.full_name}</strong>,</p>
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
      console.log(`[MailService] Auction win email sent to ${user.email}`);
    } catch (error) {
      console.error(`[MailService] Failed to send auction win email to ${user.email}`, error);
    }
  }

  async sendAuctionStandbyWinEmail(user: any, auctionId: number, productName: string, paymentLink: string, amount: number) {
    try {
      await this.mailerService.sendMail({
        to: user.email,
        subject: `Lucky You: Your Purchase Right for Auction #${auctionId} is Now Available! - FigiCore`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #3b82f6; padding: 20px; text-align: center;">
                    <h2 style="color: white; margin: 0;">Fortune Smiles Upon You!</h2>
                </div>
                <div style="padding: 30px;">
                    <p>Hello <strong>${user.full_name}</strong>,</p>
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
      console.log(`[MailService] Auction standby win email sent to ${user.email}`);
    } catch (error) {
      console.error(`[MailService] Failed to send auction standby win email to ${user.email}`, error);
    }
  }

  // ─── Targeted Promotion Email ───────────────────────────────────────────────

  async sendTargetedPromotionEmail(user: { email: string; full_name: string }, promotion: any) {
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
        ? `Valid until: <strong>${new Date(promotion.end_date).toLocaleDateString('vi-VN')}</strong>`
        : 'No expiry — collect anytime!';

      await this.mailerService.sendMail({
        to: user.email,
        subject: `🎁 New Voucher Available For You — FigiCore`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden;">
            <div style="background: linear-gradient(135deg, #111 0%, #333 100%); padding: 28px; text-align: center;">
              <h2 style="color: #fff; margin: 0; font-size: 22px;">🎁 A New Voucher Is Waiting For You!</h2>
            </div>

            <div style="padding: 30px;">
              <p>Hello <strong>${user.full_name}</strong>,</p>
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
      console.log(`[MailService] Targeted promo email sent to ${user.email}`);
    } catch (error) {
      console.error(`[MailService] Failed to send targeted promo email to ${user.email}`, error);
    }
  }

  // ─── Birthday Email ─────────────────────────────────────────────────────────

  async sendBirthdayEmail(email: string, fullName: string, voucherCode: string, validUntil: Date) {
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const walletUrl = `${frontendUrl}/customer/profile?tab=vouchers`;

      const formattedExpiry = new Intl.DateTimeFormat('en-US', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }).format(validUntil);

      await this.mailerService.sendMail({
        to: email,
        subject: `🎂 Happy Birthday Month, ${fullName}! A Gift from FigiCore`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border-radius: 12px; overflow: hidden; border: 1px solid #eaeaea;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #7c3aed 0%, #db2777 100%); padding: 36px; text-align: center;">
              <p style="font-size: 48px; margin: 0;">🎂</p>
              <h1 style="color: #fff; margin: 12px 0 4px; font-size: 26px;">Happy Birthday!</h1>
              <p style="color: rgba(255,255,255,0.85); margin: 0; font-size: 15px;">Celebrating your birthday month, ${fullName}!</p>
            </div>

            <!-- Body -->
            <div style="padding: 32px;">
              <p style="color: #374151; font-size: 15px;">
                To celebrate your special month, FigiCore has <strong>automatically added a special voucher</strong> to your wallet. You can use it right away at checkout!
              </p>

              <!-- Voucher Card -->
              <div style="border: 2px dashed #7c3aed; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center; background: #faf5ff;">
                <p style="font-size: 13px; color: #7c3aed; margin: 0 0 8px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">🎁 Birthday Gift</p>
                <p style="font-size: 32px; font-weight: bold; color: #111; margin: 8px 0;">10% OFF</p>
                <p style="font-size: 13px; color: #6b7280; margin: 4px 0;">
                  Code: <span style="font-family: monospace; background: #ede9fe; color: #7c3aed; padding: 3px 10px; border-radius: 6px; font-weight: bold;">\${voucherCode}</span>
                </p>
                <p style="font-size: 12px; color: #9ca3af; margin-top: 10px;">
                  Expires: \${formattedExpiry} &nbsp;·&nbsp; Already in your wallet
                </p>
              </div>

              <div style="background: #fdf2f8; border-left: 4px solid #db2777; padding: 16px; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 14px; color: #9d174d;">
                   <strong>Good news:</strong> No need to copy the code! The voucher is saved in your <strong>"Voucher Wallet"</strong> and will appear automatically during checkout.
                </p>
              </div>

              <!-- CTA -->
              <div style="text-align: center; margin: 28px 0 16px;">
                <a href="\${walletUrl}"
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
              <p style="color: #d1d5db; font-size: 11px; margin: 0;">© \${new Date().getFullYear()} FigiCore — With love 💜</p>
            </div>
          </div>
        `,
      });
      console.log(`[MailService] Birthday email sent to \${email}`);
    } catch (error) {
      console.error(`[MailService] Failed to send birthday email to \${email}`, error);
    }
  }
}