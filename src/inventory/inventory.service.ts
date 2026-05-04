import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService, private mailService: MailService) { }

  async createReceipt(userId: number, data: { note?: string, items: { variant_id: number, quantity_good: number, quantity_defect: number }[] }) {
    const { note, items } = data;

    if (!items || items.length === 0) throw new BadRequestException('No items provided for receipt.');

    return await this.prisma.$transaction(async (tx) => {
      // 0. Ensure Employee Exists (Fix Foreign Key Error)
      await this.ensureEmployeeExists(tx, userId);

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

        // 2b. Check Product Type & Update Vendor Stock
        const variant = await tx.product_variants.findUnique({
          where: { variant_id: item.variant_id },
          include: { products: true, product_preorder_configs: true }
        });

        if (!variant) throw new BadRequestException(`Variant ${item.variant_id} not found.`);

        const isPreorder = variant.products.type_code === 'PREORDER' || !!variant.product_preorder_configs;

        if (isPreorder) {
          // INTERCEPTION: Add to Virtual Holding Stock (stock_held) on Config
          // Do NOT add to Retail Stock (stock_available)

          if (variant.product_preorder_configs) {
            const bookingEnd = variant.product_preorder_configs.booking_end_date;
            if (bookingEnd && new Date(bookingEnd) > new Date()) {
              throw new BadRequestException(`Pre-order product ${variant.sku} is still in the deposit window. Inventory cannot be imported at this time to prevent logic conflicts.`);
            }

            await tx.product_preorder_configs.update({
              where: { config_id: variant.product_preorder_configs.config_id },
              data: {
                stock_held: { increment: item.quantity_good }
              }
            });

            // TRIGGER: FIFO Allocation
            if (item.quantity_good > 0) {
              await this.allocatePreorders(tx, item.variant_id, item.quantity_good);
            }
          }

          // Defect stock might still go to variant or separate field? 
          // Assuming standard defect handling for now or just log it.
          if (item.quantity_defect > 0) {
            await tx.product_variants.update({
              where: { variant_id: item.variant_id },
              data: { stock_defect: { increment: item.quantity_defect } }
            });
          }

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
              note: isPreorder ? 'Pre-order Stock Inbound (Held)' : 'Good Stock Inbound'
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

  async completeReceipt(receiptId: number, userId: number, items: { item_id: number, quantity_good: number, quantity_defect: number }[]) {
    if (!items || items.length === 0) throw new BadRequestException('No items provided for completion.');

    return await this.prisma.$transaction(async (tx) => {
      // 1. Ensure Employee Exists
      await this.ensureEmployeeExists(tx, userId);

      // 2. Fetch and Validate Receipt
      const receipt = await tx.inventory_receipts.findUnique({
        where: { receipt_id: receiptId }
      });

      if (!receipt) throw new BadRequestException('Receipt not found.');
      if (receipt.status_code === 'COMPLETED') throw new BadRequestException('This receipt is already completed.');

      // 3. Update Receipt Header
      const updatedReceipt = await tx.inventory_receipts.update({
        where: { receipt_id: receiptId },
        data: {
          status_code: 'COMPLETED',
          warehouse_staff_id: userId,
          updated_at: new Date()
        }
      });

      // 4. Process Items
      for (const item of items) {
        if (item.quantity_good < 0 || item.quantity_defect < 0) {
          throw new BadRequestException('Quantity cannot be negative.');
        }

        // 4a. Fetch existing receipt item
        const existingItem = await tx.inventory_receipt_items.findUnique({
          where: { item_id: item.item_id }
        });

        if (!existingItem) {
           throw new BadRequestException(`Item ID ${item.item_id} not found in this receipt.`);
        }
        if (existingItem.receipt_id !== receiptId) {
            throw new BadRequestException(`Item ID ${item.item_id} does not belong to receipt ${receiptId}.`);
        }

        // 4b. Update receipt item quantities
        await tx.inventory_receipt_items.update({
          where: { item_id: item.item_id },
          data: {
            quantity_good: item.quantity_good,
            quantity_defect: item.quantity_defect,
            updated_at: new Date()
          }
        });

        // 4c. Update Variant Stock (Standard Costing - no MAC update)
        // Check if Preorder first to apply similar logic as createReceipt
        const variant = await tx.product_variants.findUnique({
          where: { variant_id: existingItem.variant_id },
          include: { products: true, product_preorder_configs: true }
        });

        if (!variant) throw new BadRequestException(`Variant ${existingItem.variant_id} not found.`);
        const isPreorder = variant.products.type_code === 'PREORDER' || !!variant.product_preorder_configs;

        if (isPreorder) {
           // PREORDER LOGIC: Add to Virtual Holding Stock
           if (variant.product_preorder_configs) {
               const bookingEnd = variant.product_preorder_configs.booking_end_date;
               if (bookingEnd && new Date(bookingEnd) > new Date()) {
                   throw new BadRequestException(`Pre-order product ${variant.sku} is still in the deposit window. Inventory cannot be imported at this time to prevent logic conflicts.`);
               }

               await tx.product_preorder_configs.update({
                   where: { config_id: variant.product_preorder_configs.config_id },
                   data: { stock_held: { increment: item.quantity_good } }
               });
               if (item.quantity_good > 0) {
                   await this.allocatePreorders(tx, existingItem.variant_id, item.quantity_good);
               }
           }
           if (item.quantity_defect > 0) {
               await tx.product_variants.update({
                   where: { variant_id: existingItem.variant_id },
                   data: { stock_defect: { increment: item.quantity_defect } }
               });
           }
        } else {
           // STANDARD RETAIL LOGIC
           await tx.product_variants.update({
              where: { variant_id: existingItem.variant_id },
              data: {
                stock_available: { increment: item.quantity_good },
                stock_defect: { increment: item.quantity_defect }
              }
           });
        }

        // 4d. Create Logs
        if (item.quantity_good > 0) {
          await tx.inventory_logs.create({
            data: {
              variant_id: existingItem.variant_id,
              change_amount: item.quantity_good,
              change_type_code: 'PURCHASE_ORDER',
              reference_id: receiptId,
              note: isPreorder ? 'Pre-order Stock Inbound (Held from Draft)' : 'Approved Draft Stock Inbound'
            }
          });
        }

        if (item.quantity_defect > 0) {
          await tx.inventory_logs.create({
            data: {
              variant_id: existingItem.variant_id,
              change_amount: item.quantity_defect,
              change_type_code: 'PURCHASE_ORDER_DEFECT',
              reference_id: receiptId,
              note: 'Defect Stock Inbound (from Draft)'
            }
          });
        }
      }

      return updatedReceipt;
    });
  }

  // FIFO Allocation Logic
  private async allocatePreorders(tx: any, variantId: number, quantityAvailable: number) {
    console.log(`[Allocation] Starting FIFO allocation for Variant ${variantId}. Stock: ${quantityAvailable}`);

    // Step A: Fetch Queue (FIFO)
    const queue = await tx.preorder_contracts.findMany({
      where: {
        variant_id: variantId,
        status_code: 'DEPOSITED'
      },
      orderBy: { created_at: 'asc' }, // FIFO: Oldest first
      take: quantityAvailable,
      include: {
        users: true,
        product_variants: { include: { products: true } }
      }
    });

    let remainingStock = quantityAvailable;

    for (const contract of queue) {
      if (remainingStock <= 0) break;

      // Check if we can fill this contract
      if (remainingStock >= contract.quantity) {
        // Allocate
        remainingStock -= contract.quantity;

        // Update Contract
        await tx.preorder_contracts.update({
          where: { contract_id: contract.contract_id },
          data: {
            status_code: 'READY_FOR_PAYMENT',
            updated_at: new Date()
          }
        });

        // Decrement Stock Held
        await tx.product_preorder_configs.update({
          where: { variant_id: variantId },
          data: {
            stock_held: { decrement: contract.quantity }
          }
        });

        // Notification (Real Email)
        const user = contract.users;
        const variant = contract.product_variants;
        const productName = variant?.products?.name
          ? `${variant.products.name} - ${variant.sku}`
          : `Product Variant #${variantId}`;

        console.log(`[Notification] Sending email to User ${contract.user_id} (${user?.email})`);

        if (user && user.email) {
          const paymentLink = `${process.env.FRONTEND_URL || 'https://figicore.com'}/customer/preorders/${contract.contract_id}/pay`;

          // Run async without awaiting to not block transaction (or await if critical)
          // Ideally outside transaction, but here we are deep in logic. 
          // MailService handles errors gracefully.
          this.mailService.sendPreorderArrivalEmail(
            user.email,
            {
              customerName: user.full_name,
              productName: productName,
              paymentLink: paymentLink,
              remainingAmount: Number(contract.remaining_amount)
            }
          );
        }
      }
    }

    console.log(`[Allocation] Finished. Remaining Unallocated Stock: ${remainingStock}`);
  }

  private async ensureEmployeeExists(tx: any, userId: number) {
    const employee = await tx.employees.findUnique({ where: { user_id: userId } });
    if (!employee) {
      // Auto-create dummy employee record to satisfy Foreign Key
      await tx.employees.create({
        data: {
          user_id: userId,
          employee_code: `STAFF-${userId}`,
          job_title_code: 'WAREHOUSE',
          base_salary: 0,
          start_date: new Date()
        }
      });
    }
  }


  async getHistory(query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;
    const { search, startDate, endDate } = query;

    const where: any = {};

    if (search) {
      where.OR = [
        { note: { contains: search, mode: 'insensitive' } },
        { employees: { users: { full_name: { contains: search, mode: 'insensitive' } } } },
        {
          inventory_receipt_items: {
            some: {
              product_variants: {
                products: {
                  name: { contains: search, mode: 'insensitive' }
                }
              }
            }
          }
        }
      ];
    }

    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) where.created_at.gte = new Date(startDate);
      if (endDate) where.created_at.lte = new Date(endDate);
    }

    const [data, total] = await Promise.all([
      this.prisma.inventory_receipts.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          employees: {
            include: { users: { select: { full_name: true } } }
          },
          inventory_receipt_items: {
            include: {
              product_variants: {
                include: { products: { select: { name: true, media_urls: true } } }
              }
            }
          }
        }
      }),
      this.prisma.inventory_receipts.count({ where })
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit)
      }
    };
  }

  findAll() {
    return this.prisma.inventory_receipts.findMany({
      include: { inventory_receipt_items: true },
      orderBy: { created_at: 'desc' }
    });
  }
}
