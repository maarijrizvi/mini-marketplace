import { Injectable } from '@nestjs/common';
import { AuditService, type Actor } from '../platform/audit.service.js';
import { OutboxService } from '../platform/outbox.service.js';
import { PrismaService, type Tx } from '../platform/prisma.service.js';
import { orderNumber } from './order-view.js';

export type SettledStatus = 'succeeded' | 'failed' | 'pending' | 'unknown';

/**
 * Applies a payment result to an order. The single place where reserved stock is committed or
 * released:
 *   succeeded → order placed, stock committed (on_hand and reserved both drop), cart items removed
 *   failed    → order payment_failed, stock released (reserved drops), seller orders cancelled
 *   pending / unknown → nothing moves; stock stays held until the result arrives or the hold expires
 * Safe to call more than once: it only acts while the payment is still unresolved.
 */
@Injectable()
export class SettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async settle(paymentId: string, status: SettledStatus, providerRef: string | null, actor: Actor, reason = 'Payment failed') {
    return this.prisma.$transaction(async (tx) => {
      const [payment] = await tx.$queryRaw<{ id: string; status: string; order_id: string }[]>`
        SELECT id, status::text, order_id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
      if (!payment || !['pending', 'unknown'].includes(payment.status)) return false;

      await tx.payment.update({ where: { id: paymentId }, data: { status, providerRef: providerRef ?? undefined } });
      await tx.paymentEvent.create({ data: { paymentId, providerEventId: `${paymentId}:${status}:${Date.now()}`, status } });
      const order = await tx.order.findUniqueOrThrow({ where: { id: payment.order_id }, include: { customer: true, sellerOrders: true } });

      if (status === 'succeeded') {
        await this.moveReservations(tx, order.id, 'committed', actor);
        await tx.order.update({ where: { id: order.id }, data: { status: 'placed' } });
        await this.removeFromCart(tx, order.customerId, order.id);
        await this.outbox.add(tx, { type: 'order', id: order.id }, 'ordering.order_placed', {
          orderId: order.id,
          orderNumber: orderNumber(order.number),
          customerEmail: order.customer.email,
          customerName: order.customer.fullName,
          total: order.total.toFixed(2),
          sellerIds: order.sellerOrders.map((s) => s.sellerId),
        });
      } else if (status === 'failed') {
        await this.moveReservations(tx, order.id, 'released', actor);
        await tx.order.update({ where: { id: order.id }, data: { status: 'payment_failed' } });
        await tx.sellerOrder.updateMany({ where: { orderId: order.id }, data: { status: 'cancelled', cancelReason: reason } });
        await this.outbox.add(tx, { type: 'order', id: order.id }, 'ordering.payment_failed', {
          orderId: order.id,
          orderNumber: orderNumber(order.number),
          customerEmail: order.customer.email,
          customerName: order.customer.fullName,
        });
      } else {
        // Waiting on the provider: the items left the cart, but stock stays held.
        await this.removeFromCart(tx, order.customerId, order.id);
      }
      await this.audit.record(
        tx,
        actor,
        'payment.status_changed',
        { type: 'order', id: order.id },
        { before: { payment: payment.status }, after: { payment: status } },
      );
      return true;
    });
  }

  /** Commits or releases every held reservation of an order, row-locking stock in a fixed order. */
  private async moveReservations(tx: Tx, orderId: string, to: 'committed' | 'released', actor: Actor) {
    const held = await tx.stockReservation.findMany({ where: { orderId, status: 'held' }, orderBy: { productId: 'asc' } });
    for (const r of held) {
      await tx.$queryRaw`SELECT 1 FROM stock_items WHERE product_id = ${r.productId}::uuid FOR UPDATE`;
      await tx.stockItem.update({
        where: { productId: r.productId },
        data:
          to === 'committed'
            ? { onHand: { decrement: r.quantity }, reserved: { decrement: r.quantity } }
            : { reserved: { decrement: r.quantity } },
      });
      await tx.stockReservation.update({ where: { id: r.id }, data: { status: to } });
      await tx.inventoryMovement.create({
        data: {
          productId: r.productId,
          delta: to === 'committed' ? -r.quantity : r.quantity,
          reason: to === 'committed' ? 'commit' : 'release',
          refId: orderId,
          actor: `${actor.type}:${actor.id}`,
        },
      });
    }
  }

  private async removeFromCart(tx: Tx, customerId: string, orderId: string) {
    const items = await tx.orderItem.findMany({ where: { sellerOrder: { orderId } }, select: { productId: true } });
    await tx.cartItem.deleteMany({ where: { cart: { userId: customerId }, productId: { in: items.map((i) => i.productId) } } });
  }
}
