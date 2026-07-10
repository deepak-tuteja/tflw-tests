import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CheckoutDto } from './dto/checkout.dto';
import { AnyAuthGuard } from '../auth/guards/any-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthedUser } from '../auth/guards/bearer-auth.guard';

// User-scoped, not role-scoped (any authenticated user has exactly one cart — their own); no
// @Roles restriction anywhere in this controller.
@ApiTags('cart')
@Controller('cart')
@UseGuards(AnyAuthGuard)
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  find(@CurrentUser() user: AuthedUser) {
    return this.cart.findForUser(user.id);
  }

  @Post('items')
  addItem(@CurrentUser() user: AuthedUser, @Body() dto: AddCartItemDto) {
    return this.cart.addItem(user.id, dto.productId, dto.quantity);
  }

  @Patch('items/:id')
  updateItem(
    @CurrentUser() user: AuthedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cart.updateItem(user.id, id, dto.quantity);
  }

  @Delete('items/:id')
  @HttpCode(204)
  async removeItem(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    await this.cart.removeItem(user.id, id);
  }

  // Idempotency-Key (same convention as POST /orders): a repeated key returns the original order
  // (200) instead of checking out twice (201).
  @Post('checkout')
  async checkout(
    @CurrentUser() user: AuthedUser,
    @Body() dto: CheckoutDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { order, created } = await this.cart.checkout(user.id, dto.couponCode, idempotencyKey);
    res.status(created ? 201 : 200);
    return order;
  }
}
