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




  async sendEmployeeActivation(to: string, tempPass: string, token: string) {
    // Use environment variable for Frontend URL, fallback to localhost if not set (though .env is required)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const activationLink = `${frontendUrl}/auth/activate?token=${token}`;

    await this.mailerService.sendMail({
      to: to,
      from: process.env.MAIL_FROM, // Ensure sender is set correctly
      subject: 'Kích hoạt tài khoản nhân viên FigiCore',
      html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                    <h2 style="color: #111;">Chào mừng gia nhập đội ngũ FigiCore!</h2>
                    <p>Tài khoản của bạn đã được khởi tạo. Dưới đây là thông tin đăng nhập tạm thời:</p>
                    
                    <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Email:</strong> ${to}</p>
                        <p style="margin: 5px 0;"><strong>Mật khẩu tạm:</strong> <span style="font-family: monospace; font-size: 16px; background: #eee; padding: 2px 6px; border-radius: 4px;">${tempPass}</span></p>
                    </div>

                    <p>Vui lòng nhấp vào nút bên dưới để đổi mật khẩu và kích hoạt tài khoản:</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${activationLink}" 
                           style="background-color: #000; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                           Kích Hoạt Tài Khoản
                        </a>
                    </div>
                    
                    <p style="color: #666; font-size: 14px;">Liên kết này sẽ hết hạn sau 24 giờ.</p>
                    <p style="color: #999; font-size: 12px; margin-top: 30px;">Hệ thống FigiCore</p>
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
}