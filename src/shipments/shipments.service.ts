import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class ShipmentsService {
  private readonly logger = new Logger(ShipmentsService.name);
  private readonly GHN_API_URL = 'https://dev-online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/create'; // Sandbox URL

  constructor(
    private prisma: PrismaService,
    private httpService: HttpService,
    private configService: ConfigService
  ) { }

  async calculateOrderWeight(orderId: number): Promise<number> {
    const orderItems = await this.prisma.order_items.findMany({
      where: { order_id: orderId },
      include: {
        product_variants: true,
      },
    });

    let totalWeight = 0;

    for (const item of orderItems) {
      let weight = item.product_variants.weight_g || 200; // Default 200g if missing

      // If Blindbox that has been allocated (resolved)
      if (item.allocated_product_id) {
        // Fetch the FIRST variant of the resolved product to get its weight
        // Assumption: All variants in a product share similar weight, or we pick the first one
        const resolvedVariant = await this.prisma.product_variants.findFirst({
          where: { product_id: item.allocated_product_id },
          select: { weight_g: true }
        });

        if (resolvedVariant) {
          weight = resolvedVariant.weight_g;
        }
      }

      totalWeight += weight * item.quantity;
    }

    return totalWeight;
  }

  async createShipment(orderId: number, staffId: number, videoUrl?: string) {
    // 1. Fetch Order Data
    const order = await this.prisma.orders.findUnique({
      where: { order_id: orderId },
      include: {
        order_items: { include: { product_variants: { include: { products: true } } } },
        addresses: true,
        users: true
      }
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.status_code !== 'PROCESSING') {
      // Allow creating shipment if it's already packed but failed previously, or if it's just processed
      // For strict flow: throw new BadRequestException('Order must be in PROCESSING status to create shipment');
    }

    if (!order.addresses) throw new BadRequestException('Order does not have a shipping address');

    // 2. Calculate Data
    // Logic: calculateOrderWeight iterates through items effectively
    const weight = await this.calculateOrderWeight(orderId);

    // Map items for GHN
    const items = order.order_items.map(item => {
      // Determine code and name
      const code = item.product_variants.sku;
      const name = item.product_variants.products.name + ' - ' + item.product_variants.option_name;

      return {
        name: name,
        code: code,
        quantity: item.quantity,
        price: Number(item.unit_price),
        length: item.product_variants.length_cm || 10,
        width: item.product_variants.width_cm || 10,
        height: item.product_variants.height_cm || 10,
        weight: item.product_variants.weight_g || 200, // Per item fallback
        category: { level1: "Figure" }
      };
    });

    // 3. Construct GHN Payload
    const token = this.configService.get<string>('GHN_API_TOKEN');
    const shopId = this.configService.get<string>('GHN_SHOP_ID');

    if (!token || !shopId) throw new BadRequestException('GHN Configuration missing (Token/ShopID)');

    // COD Calculation
    let codAmount = 0;
    if (order.payment_method_code === 'COD') {
      const total = Number(order.total_amount);
      const paid = Number(order.paid_amount || 0);
      codAmount = Math.max(0, total - paid);
    }

    const payload = {
      payment_type_id: 1, // Shop/Seller pays shipping
      note: order.note || "Hàng dễ vỡ, xin nhẹ tay",
      required_note: "CHOXEMHANGKHONGTHU", // Allow view, no trial
      from_name: "Figicore Store",
      from_phone: "0349187115",
      from_address: "K47 Hoàng Văn Thái, Hòa Minh, Liên Chiểu, Đà Nẵng",
      from_ward_code: "40302", // Explicit: Da Nang Warehouse
      from_district_id: 1534,  // Explicit: Da Nang Warehouse

      to_name: order.addresses.recipient_name,
      to_phone: order.addresses.recipient_phone,
      to_address: order.addresses.detail_address,
      to_ward_code: order.addresses.ward_code,
      to_district_id: Number(order.addresses.district_id),

      cod_amount: codAmount,
      weight: weight, // Total Weight Calculated
      length: 10, // Default Dimensions
      width: 10,
      height: 10,

      service_type_id: 2, // Standard Express
      items: items
    };

    // 4. Call GHN API
    try {
      const response = await firstValueFrom(
        this.httpService.post(this.GHN_API_URL, payload, {
          headers: {
            'Content-Type': 'application/json',
            'Token': token,
            'ShopId': shopId
          }
        })
      );

      const ghnData = response.data.data;

      // 5. Save & Update
      // 5. Save & Update
      await this.prisma.$transaction(async (tx) => {
        // Create Shipment Record
        await tx.shipments.create({
          data: {
            order_id: orderId,
            tracking_code: ghnData.order_code,
            shipping_fee: ghnData.total_fee,
            status_code: 'READY_TO_PICK',
            ghn_service_id: 2
          }
        });

        // Update Order Status & Sync Actual Fee
        await tx.orders.update({
          where: { order_id: orderId },
          data: {
            status_code: 'PACKED', // Updated status as requested
            original_shipping_fee: Number(ghnData.total_fee), // Sync exact cost
            packed_at: new Date(),
            packing_video_urls: videoUrl ? JSON.stringify([videoUrl]) : undefined,
          }
        });
      });

      return {
        tracking_code: ghnData.order_code,
        fee: ghnData.total_fee
      };

    } catch (error: any) {
      this.logger.error("GHN Create Failed", error.response?.data || error.message);
      throw new BadRequestException(error.response?.data?.message || "Failed to create shipment with GHN");
    }
  }

  create(createShipmentDto: CreateShipmentDto) {
    return 'This action adds a new shipment';
  }

  findAll() {
    return `This action returns all shipments`;
  }

  findOne(id: number) {
    return `This action returns a #${id} shipment`;
  }

  update(id: number, updateShipmentDto: UpdateShipmentDto) {
    return `This action updates a #${id} shipment`;
  }

  remove(id: number) {
    return `This action removes a #${id} shipment`;
  }
}
