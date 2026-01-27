import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) { }

  async createReceipt(userId: number, data: { note?: string, items: { variant_id: number, quantity_good: number, quantity_defect: number }[] }) {
    const { note, items } = data;

    if (!items || items.length === 0) throw new BadRequestException('No items provided for receipt.');

    return await this.prisma.$transaction(async (tx) => {
      // 1. Create Receipt Header
      const receipt = await tx.inventory_receipts.create({
        data: {
          note: note,
          status_code: 'COMPLETED',
          warehouse_staff_id: userId, // Using real user ID from token
        }
      });

      // 2. Process Items
      for (const item of items) {
        if (item.quantity_good < 0 || item.quantity_defect < 0) {
          throw new BadRequestException('Quantity cannot be negative.');
        }

        const totalQty = item.quantity_good + item.quantity_defect;
        if (totalQty === 0) continue;

        // 2a. Create Receipt Item Line
        await tx.inventory_receipt_items.create({
          data: {
            receipt_id: receipt.receipt_id,
            variant_id: item.variant_id,
            quantity_total: totalQty,
            quantity_good: item.quantity_good,
            quantity_defect: item.quantity_defect
          }
        });

        // 2b. Update Variant Stock
        // 2b. Check Product Type & Update Vendor Stock
        const variant = await tx.product_variants.findUnique({
          where: { variant_id: item.variant_id },
          include: { products: true }
        });

        if (!variant) throw new BadRequestException(`Variant ${item.variant_id} not found.`);

        if (variant.products.type_code === 'PREORDER') {
          // SYNC LOGIC: Preorder variants share the same physical stock.
          // Updating one means updating all variants for this product.
          await tx.product_variants.updateMany({
            where: { product_id: variant.product_id },
            data: {
              stock_available: { increment: item.quantity_good },
              stock_defect: { increment: item.quantity_defect }
            }
          });
        } else {
          // STANDARD LOGIC: Update only this specific variant
          await tx.product_variants.update({
            where: { variant_id: item.variant_id },
            data: {
              stock_available: { increment: item.quantity_good },
              stock_defect: { increment: item.quantity_defect }
            }
          });
        }

        // 2c. Create Log (Good)
        if (item.quantity_good > 0) {
          await tx.inventory_logs.create({
            data: {
              variant_id: item.variant_id,
              change_amount: item.quantity_good,
              change_type_code: 'PURCHASE_ORDER',
              reference_id: receipt.receipt_id,
              note: 'Good Stock Inbound'
            }
          });
        }

        // 2d. Create Log (Defect)
        if (item.quantity_defect > 0) {
          await tx.inventory_logs.create({
            data: {
              variant_id: item.variant_id,
              change_amount: item.quantity_defect,
              change_type_code: 'PURCHASE_ORDER_DEFECT',
              reference_id: receipt.receipt_id,
              note: 'Defect Stock Inbound'
            }
          });
        }
      }

      return receipt;
    });
  }

  findAll() {
    return this.prisma.inventory_receipts.findMany({
      include: { inventory_receipt_items: true },
      orderBy: { created_at: 'desc' }
    });
  }
}
