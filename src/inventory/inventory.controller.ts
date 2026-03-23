import { Controller, Post, Patch, Param, Get, Body, Query, UseGuards, Request, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('inventory')
export class InventoryController {
  private readonly logger = new Logger(InventoryController.name);

  constructor(private readonly inventoryService: InventoryService) { }

  @Post('receipts')
  @UseGuards(JwtAuthGuard)
  async create(@Request() req: any, @Body() dto: any) {
    const user = req.user;

    // Debug Log
    this.logger.log(`[Inventory] Request received from User ID: ${user?.userId || user?.id || user?.sub || user?.user_id}`);
    this.logger.debug(`[Inventory] Full User Object: ${JSON.stringify(user)}`);

    if (!user) {
      throw new UnauthorizedException('User not found in request context');
    }

    // Extract ID (Fallback to 'sub' or 'userId' or 'id' or 'user_id')
    const userId = Number(user.userId || user.id || user.sub || user.user_id);
    try {
      return await this.inventoryService.createReceipt(userId, dto);
    } catch (error) {
      this.logger.error(`[Inventory] Error creating receipt: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Patch('receipts/:id/complete')
  @UseGuards(JwtAuthGuard)
  async complete(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: { items: { item_id: number, quantity_good: number, quantity_defect: number }[] }
  ) {
    const user = req.user;
    if (!user) throw new UnauthorizedException('User not found in request context');
    
    const userId = Number(user.userId || user.id || user.sub || user.user_id);
    const receiptId = parseInt(id, 10);

    if (isNaN(receiptId)) {
        throw new BadRequestException('Invalid receipt ID');
    }

    try {
      this.logger.log(`[Inventory] Completing Receipt #${receiptId} by User ${userId}`);
      return await this.inventoryService.completeReceipt(receiptId, userId, dto.items);
    } catch (error) {
      this.logger.error(`[Inventory] Error completing receipt #${receiptId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('receipts') // GET /inventory/receipts
  async getHistory(@Request() req: any, @Query() query: any) {
    return await this.inventoryService.getHistory(query);
  }
}