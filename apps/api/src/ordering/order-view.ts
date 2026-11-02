import type { OrderView } from '@mm/shared';
import type { Prisma } from '../generated/prisma/client.js';

export const orderInclude = {
  payments: { orderBy: { createdAt: 'desc' }, take: 1 },
  sellerOrders: {
    orderBy: { createdAt: 'asc' },
    include: { seller: { select: { id: true, shopName: true } }, items: true },
  },
} satisfies Prisma.OrderInclude;

export type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export const orderNumber = (n: number) => `MM-${n}`;

export function orderView(o: OrderRow): OrderView {
  const payment = o.payments[0];
  return {
    id: o.id,
    number: orderNumber(o.number),
    status: o.status,
    payment: payment ? { status: payment.status, reference: payment.providerRef } : null,
    createdAt: o.createdAt.toISOString(),
    subtotal: o.subtotal.toFixed(2),
    shipping: o.shippingTotal.toFixed(2),
    discount: o.discountTotal.toFixed(2),
    total: o.total.toFixed(2),
    shipTo: o.shipTo as OrderView['shipTo'],
    shipments: o.sellerOrders.map((so) => ({
      id: so.id,
      seller: so.seller,
      status: so.status,
      subtotal: so.subtotal.toFixed(2),
      shipping: so.shipping.toFixed(2),
      items: so.items.map((i) => ({
        productId: i.productId,
        name: i.name,
        sku: i.sku,
        unitPrice: i.unitPrice.toFixed(2),
        quantity: i.quantity,
        lineTotal: i.lineTotal.toFixed(2),
      })),
    })),
  };
}
