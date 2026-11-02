import { HttpStatus, Injectable } from '@nestjs/common';
import type { checkoutSchema, CheckoutQuote, SessionUser } from '@mm/shared';
import type { z } from 'zod';
import { availableOf, isSellable } from '../cart/cart.service.js';
import { ApiError, fieldError } from '../common/http.js';
import { fromCents, toCents } from '../common/money.js';
import { Prisma } from '../generated/prisma/client.js';
import { AuditService } from '../platform/audit.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import { AddressesService } from './addresses.js';
import { orderInclude, orderView } from './order-view.js';
import { PaymentProvider } from './payment-provider.js';
import { quote, UnknownPromoError, type PricedLine, type Quote } from './pricing.js';
import { SettlementService } from './settlement.service.js';

/** How long stock stays held for an order whose payment hasn't resolved. */
export const RESERVATION_MINUTES = 15;

type CheckoutInput = z.output<typeof checkoutSchema>;

const quoteView = (q: Quote): CheckoutQuote => ({
  sellers: q.sellers.map((s) => ({
    sellerId: s.sellerId,
    shopName: s.shopName,
    subtotal: fromCents(s.subtotal),
    shipping: fromCents(s.shipping),
    lines: s.lines.map((l) => ({ name: l.name, quantity: l.quantity, lineTotal: fromCents(l.gross) })),
  })),
  subtotal: fromCents(q.subtotal),
  shipping: fromCents(q.shipping),
  discount: fromCents(q.discount),
  total: fromCents(q.total),
  promo: q.promo,
});

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly addresses: AddressesService,
    private readonly provider: PaymentProvider,
    private readonly settlement: SettlementService,
    private readonly audit: AuditService,
  ) {}

  /** Prices the selected cart items as checkout would, without reserving anything. */
  async quote(user: SessionUser, promoCode?: string): Promise<CheckoutQuote> {
    return quoteView(this.price(await this.selectedLines(user.id), promoCode));
  }

  /**
   * Places an order for the selected cart items.
   *
   * 1. A repeated idempotency key returns the original order; nothing is charged twice.
   * 2. In one transaction: lock the stock rows (in product-id order, so concurrent checkouts can't
   *    deadlock), check availability, create the order with copied prices, and reserve the units.
   *    Two shoppers racing for the last unit serialize on the row lock; the second sees none left.
   * 3. Charge the provider outside the transaction (no locks held during a network call).
   * 4. Settle: commit or release the reservation according to the result.
   */
  async checkout(user: SessionUser, input: CheckoutInput) {
    const replay = await this.existing(user, input.idempotencyKey);
    if (replay) return { order: replay, replayed: true };

    const address = await this.addresses.owned(user.id, input.addressId);
    const lines = await this.selectedLines(user.id);
    const priced = this.price(lines, input.promoCode);
    if (input.expectedTotal && toCents(input.expectedTotal) !== priced.total) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        `Prices changed since you opened checkout. The total is now ${fromCents(priced.total)}. Review and place the order again.`,
        {
          code: 'prices_changed',
        },
      );
    }

    let created: { orderId: string; paymentId: string };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const ids = [...new Set(lines.map((l) => l.productId))].sort();
        const stock = await tx.$queryRaw<{ product_id: string; on_hand: number; reserved: number }[]>`
          SELECT product_id, on_hand, reserved FROM stock_items
           WHERE product_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
           ORDER BY product_id FOR UPDATE`;
        const short = lines.filter((l) => {
          const row = stock.find((s) => s.product_id === l.productId);
          return !row || row.on_hand - row.reserved < l.quantity;
        });
        if (short.length) {
          throw new ApiError(
            HttpStatus.CONFLICT,
            `Not enough stock for ${short.map((l) => l.name).join(', ')}. Update your cart and try again.`,
            {
              code: 'insufficient_stock',
            },
          );
        }

        const order = await tx.order.create({
          data: {
            customerId: user.id,
            idempotencyKey: input.idempotencyKey,
            subtotal: fromCents(priced.subtotal),
            discountTotal: fromCents(priced.discount),
            shippingTotal: fromCents(priced.shipping),
            total: fromCents(priced.total),
            shipTo: {
              label: address.label,
              line1: address.line1,
              line2: address.line2,
              city: address.city,
              postcode: address.postcode,
              country: address.country,
            },
          },
        });
        for (const s of priced.sellers) {
          await tx.sellerOrder.create({
            data: {
              orderId: order.id,
              sellerId: s.sellerId,
              subtotal: fromCents(s.subtotal),
              shipping: fromCents(s.shipping),
              items: {
                create: s.lines.map((l) => ({
                  productId: l.productId,
                  sku: l.sku,
                  name: l.name,
                  unitPrice: fromCents(l.unitPrice),
                  quantity: l.quantity,
                  discount: fromCents(l.discount),
                  lineTotal: fromCents(l.lineTotal),
                })),
              },
            },
          });
        }
        const expiresAt = new Date(Date.now() + RESERVATION_MINUTES * 60_000);
        for (const l of lines) {
          await tx.stockItem.update({ where: { productId: l.productId }, data: { reserved: { increment: l.quantity } } });
          await tx.stockReservation.create({ data: { orderId: order.id, productId: l.productId, quantity: l.quantity, expiresAt } });
          await tx.inventoryMovement.create({
            data: { productId: l.productId, delta: -l.quantity, reason: 'reserve', refId: order.id, actor: `user:${user.id}` },
          });
        }
        const payment = await tx.payment.create({
          data: { orderId: order.id, idempotencyKey: `order:${order.id}`, amount: fromCents(priced.total) },
        });
        await this.audit.record(
          tx,
          { type: 'user', id: user.id },
          'order.created',
          { type: 'order', id: order.id },
          {
            after: { total: fromCents(priced.total), sellers: priced.sellers.length, promo: priced.promo?.code ?? null },
          },
        );
        return { orderId: order.id, paymentId: payment.id };
      });
    } catch (e) {
      // A double-submit that got past the first check: the unique key makes the second one fail here.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const order = await this.existing(user, input.idempotencyKey);
        if (order) return { order, replayed: true };
      }
      throw e;
    }

    const charge = await this.provider.charge(`order:${created.orderId}`, priced.total, input.paymentOutcome);
    await this.settlement.settle(created.paymentId, charge.status, charge.providerRef, { type: 'system', id: 'payments.sandbox' });
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: created.orderId }, include: orderInclude });
    return { order: orderView(order), replayed: false };
  }

  private async existing(user: SessionUser, key: string) {
    const order = await this.prisma.order.findUnique({ where: { idempotencyKey: key }, include: orderInclude });
    if (!order) return null;
    if (order.customerId !== user.id) throw new ApiError(HttpStatus.CONFLICT, 'Start checkout again.', { code: 'idempotency_key_reused' });
    return orderView(order);
  }

  private async selectedLines(userId: string): Promise<PricedLine[]> {
    const items = await this.prisma.cartItem.findMany({
      where: { isSelected: true, cart: { userId } },
      include: {
        product: {
          include: {
            seller: { select: { id: true, shopName: true, status: true } },
            category: { select: { isVisible: true } },
            stock: { select: { onHand: true, reserved: true } },
          },
        },
      },
      orderBy: { addedAt: 'asc' },
    });
    if (!items.length) throw new ApiError(HttpStatus.CONFLICT, 'Select at least one item in your cart.', { code: 'nothing_selected' });
    const unavailable = items.filter((i) => !isSellable(i.product) || availableOf(i.product) === 0);
    if (unavailable.length) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        `${unavailable.map((i) => i.product.name).join(', ')} can’t be bought right now. Untick or remove it.`,
        {
          code: 'unavailable',
        },
      );
    }
    // Today's prices from the database, never from the client.
    return items.map((i) => ({
      productId: i.productId,
      sellerId: i.product.seller.id,
      shopName: i.product.seller.shopName,
      name: i.product.name,
      sku: i.product.sku,
      quantity: i.quantity,
      unitPrice: toCents(i.product.price.toFixed(2)),
    }));
  }

  private price(lines: PricedLine[], promoCode?: string) {
    try {
      return quote(lines, promoCode);
    } catch (e) {
      if (e instanceof UnknownPromoError) throw fieldError(HttpStatus.BAD_REQUEST, 'promoCode', 'That code isn’t valid.', 'promo_invalid');
      throw e;
    }
  }
}
