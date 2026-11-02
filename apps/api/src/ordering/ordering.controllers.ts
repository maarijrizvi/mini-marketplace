import { Body, Controller, Get, HttpStatus, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { checkoutSchema, quoteSchema, type SessionUser } from '@mm/shared';
import type { z } from 'zod';
import { ApiError, ZodBody } from '../common/http.js';
import { CurrentUser, Roles } from '../identity/auth.guard.js';
import { PrismaService } from '../platform/prisma.service.js';
import { CheckoutService } from './checkout.service.js';
import { orderInclude, orderView } from './order-view.js';

@Roles('customer')
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post('quote')
  quote(@CurrentUser() user: SessionUser, @Body(new ZodBody(quoteSchema)) body: z.output<typeof quoteSchema>) {
    return this.checkout.quote(user, body.promoCode || undefined);
  }

  /** 201 for a new order, 200 when the same idempotency key is replayed. */
  @Post()
  async place(
    @CurrentUser() user: SessionUser,
    @Body(new ZodBody(checkoutSchema)) body: z.output<typeof checkoutSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { order, replayed } = await this.checkout.checkout(user, { ...body, promoCode: body.promoCode || undefined });
    res.status(replayed ? HttpStatus.OK : HttpStatus.CREATED);
    return { order, replayed };
  }
}

/** A customer only ever sees their own orders; anyone else's id is a 404, not a 403. */
@Roles('customer')
@Controller('orders')
export class OrdersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: SessionUser) {
    const orders = await this.prisma.order.findMany({
      where: { customerId: user.id },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return orders.map(orderView);
  }

  @Get(':id')
  async get(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const order = await this.prisma.order.findFirst({ where: { id, customerId: user.id }, include: orderInclude });
    if (!order) throw new ApiError(HttpStatus.NOT_FOUND, 'Order not found.', { code: 'not_found' });
    return orderView(order);
  }
}
