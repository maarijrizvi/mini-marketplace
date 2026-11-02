import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { addToCartSchema, cartSelectionSchema, mergeCartSchema, updateCartItemSchema, type SessionUser } from '@mm/shared';
import type { z } from 'zod';
import { ZodBody } from '../common/http.js';
import { CurrentUser, Roles } from '../identity/auth.guard.js';
import { CartService } from './cart.service.js';

/** Carts belong to customer accounts; sellers and admins get 403. */
@Roles('customer')
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  view(@CurrentUser() user: SessionUser) {
    return this.cart.view(user.id);
  }

  @Post('items')
  add(@CurrentUser() user: SessionUser, @Body(new ZodBody(addToCartSchema)) body: z.output<typeof addToCartSchema>) {
    return this.cart.add(user.id, body);
  }

  @Patch('items/:productId')
  update(
    @CurrentUser() user: SessionUser,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body(new ZodBody(updateCartItemSchema)) body: z.output<typeof updateCartItemSchema>,
  ) {
    return this.cart.update(user.id, productId, body);
  }

  @Delete('items/:productId')
  remove(@CurrentUser() user: SessionUser, @Param('productId', ParseUUIDPipe) productId: string) {
    return this.cart.remove(user.id, productId);
  }

  @Post('selection')
  select(@CurrentUser() user: SessionUser, @Body(new ZodBody(cartSelectionSchema)) body: z.output<typeof cartSelectionSchema>) {
    return this.cart.select(user.id, body);
  }

  @Post('remove-selected')
  removeSelected(@CurrentUser() user: SessionUser) {
    return this.cart.removeSelected(user.id);
  }

  @Post('merge')
  merge(@CurrentUser() user: SessionUser, @Body(new ZodBody(mergeCartSchema)) body: z.output<typeof mergeCartSchema>) {
    return this.cart.merge(user.id, body);
  }
}
