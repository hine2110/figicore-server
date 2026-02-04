import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(private mailerService: MailerService) { }

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
}
