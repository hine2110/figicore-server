import { Controller, Post, Body, UseGuards, Request, Logger, UnauthorizedException } from '@nestjs/common';
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
}
