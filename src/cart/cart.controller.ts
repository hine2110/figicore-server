import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { CartService } from './cart.service';
import { CreateCartDto } from './dto/create-cart.dto';
import { UpdateCartDto } from './dto/update-cart.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) { }

  @Post()
  async addToCart(@Request() req, @Body() createCartDto: CreateCartDto) {
    return await this.cartService.addToCart(req.user.userId, createCartDto);
  }

  @Get()
  getCart(@Request() req) {
    return this.cartService.getCart(req.user.userId);
  }

  @Patch(':itemId')
  updateQuantity(@Request() req, @Param('itemId') itemId: string, @Body() updateCartDto: UpdateCartDto) {
    // Assuming simple update quantity logic. DTO might need check.
    return this.cartService.updateQuantity(req.user.userId, +itemId, updateCartDto.quantity || 1);
  }

  @Delete(':itemId')
  remove(@Request() req, @Param('itemId') itemId: string) {
    return this.cartService.removeFromCart(req.user.userId, +itemId);
  }

  @Delete()
  clearCart(@Request() req) {
    return this.cartService.clearCart(req.user.userId);
  }
}
