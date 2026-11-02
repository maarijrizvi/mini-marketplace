import { HttpStatus, Injectable } from '@nestjs/common';
import type { addToCartSchema, CartLine, cartSelectionSchema, CartView, mergeCartSchema, updateCartItemSchema } from '@mm/shared';
import type { z } from 'zod';
import { ApiError } from '../common/http.js';
import { fromCents, toCents } from '../common/money.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../platform/prisma.service.js';

const lineInclude = {
  product: {
    include: {
      seller: { select: { id: true, shopName: true, status: true } },
      category: { select: { isVisible: true } },
      stock: { select: { onHand: true, reserved: true } },
    },
  },
} satisfies Prisma.CartItemInclude;

type LineRow = Prisma.CartItemGetPayload<{ include: typeof lineInclude }>;
type ProductRow = LineRow['product'];

export const availableOf = (p: ProductRow) => Math.max(0, (p.stock?.onHand ?? 0) - (p.stock?.reserved ?? 0));
export const isSellable = (p: ProductRow) => p.isActive && p.seller.status === 'approved' && p.category.isVisible;

const notFound = () => new ApiError(HttpStatus.NOT_FOUND, 'This product isn’t available.', { code: 'not_found' });

/**
 * Each customer has one cart. Prices shown are always today's prices; `previousPrice` flags any
 * change since the item was added. Checkout prices from the database again regardless.
 */
@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async view(userId: string): Promise<CartView> {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: { items: { include: lineInclude, orderBy: { addedAt: 'asc' } } },
    });
    const lines: CartLine[] = (cart?.items ?? []).map((item) => {
      const p = item.product;
      const available = availableOf(p);
      const unavailable = !isSellable(p) || available === 0;
      const unit = toCents(p.price.toFixed(2));
      return {
        productId: p.id,
        name: p.name,
        sku: p.sku,
        seller: { id: p.seller.id, shopName: p.seller.shopName },
        quantity: item.quantity,
        unitPrice: fromCents(unit),
        previousPrice: item.priceAtAdd.equals(p.price) ? null : item.priceAtAdd.toFixed(2),
        lineTotal: fromCents(unit * item.quantity),
        available,
        unavailable,
        selected: item.isSelected && !unavailable,
      };
    });
    const selected = lines.filter((l) => l.selected);
    return {
      lines,
      itemCount: lines.filter((l) => !l.unavailable).reduce((a, l) => a + l.quantity, 0),
      selectedCount: selected.reduce((a, l) => a + l.quantity, 0),
      selectedSubtotal: fromCents(selected.reduce((a, l) => a + toCents(l.lineTotal), 0)),
    };
  }

  async add(userId: string, input: z.output<typeof addToCartSchema>) {
    const product = await this.sellableProduct(input.productId);
    const cart = await this.prisma.cart.upsert({ where: { userId }, create: { userId }, update: {} });
    const existing = await this.prisma.cartItem.findUnique({ where: { cartId_productId: { cartId: cart.id, productId: product.id } } });
    // "Buy now" means this quantity; "Add to cart" adds to what's there.
    const quantity = input.selectOnly ? input.quantity : (existing?.quantity ?? 0) + input.quantity;
    this.assertStock(product, quantity);
    await this.prisma.$transaction(async (tx) => {
      if (input.selectOnly) await tx.cartItem.updateMany({ where: { cartId: cart.id }, data: { isSelected: false } });
      await tx.cartItem.upsert({
        where: { cartId_productId: { cartId: cart.id, productId: product.id } },
        create: { cartId: cart.id, productId: product.id, quantity, priceAtAdd: product.price, isSelected: input.selectOnly },
        update: { quantity, ...(input.selectOnly ? { isSelected: true } : {}) },
      });
    });
    return this.view(userId);
  }

  async update(userId: string, productId: string, input: z.output<typeof updateCartItemSchema>) {
    const item = await this.item(userId, productId);
    if (input.quantity !== undefined) this.assertStock(item.product, input.quantity);
    if (input.selected && (!isSellable(item.product) || availableOf(item.product) === 0)) {
      throw new ApiError(HttpStatus.CONFLICT, `${item.product.name} isn’t available right now.`, { code: 'unavailable' });
    }
    await this.prisma.cartItem.update({ where: { id: item.id }, data: { quantity: input.quantity, isSelected: input.selected } });
    return this.view(userId);
  }

  async remove(userId: string, productId: string) {
    const item = await this.item(userId, productId);
    await this.prisma.cartItem.delete({ where: { id: item.id } });
    return this.view(userId);
  }

  async select(userId: string, input: z.output<typeof cartSelectionSchema>) {
    const cart = await this.prisma.cart.findUnique({ where: { userId }, include: { items: { include: lineInclude } } });
    if (!cart) return this.view(userId);
    const targets = cart.items.filter((i) => !input.productIds || input.productIds.includes(i.productId));
    // Unavailable items can't be ticked; they stay unticked when selecting everything.
    const ids = targets.filter((i) => !input.selected || (isSellable(i.product) && availableOf(i.product) > 0)).map((i) => i.id);
    await this.prisma.cartItem.updateMany({ where: { id: { in: ids } }, data: { isSelected: input.selected } });
    return this.view(userId);
  }

  async removeSelected(userId: string) {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (cart) await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id, isSelected: true } });
    return this.view(userId);
  }

  /**
   * Folds a signed-out shopper's cart into the account cart at sign-in. Quantities add up (capped
   * by stock); if the guest ticked items, those become the selection.
   */
  async merge(userId: string, input: z.output<typeof mergeCartSchema>) {
    if (!input.items.length) return this.view(userId);
    const cart = await this.prisma.cart.upsert({ where: { userId }, create: { userId }, update: {} });
    const products = await this.prisma.product.findMany({
      where: { id: { in: input.items.map((i) => i.productId) } },
      include: lineInclude.product.include,
    });
    const guestSelected = input.items.some((i) => i.selected);
    await this.prisma.$transaction(async (tx) => {
      if (guestSelected) await tx.cartItem.updateMany({ where: { cartId: cart.id }, data: { isSelected: false } });
      for (const guest of input.items) {
        const product = products.find((p) => p.id === guest.productId);
        if (!product || !isSellable(product)) continue;
        const existing = await tx.cartItem.findUnique({ where: { cartId_productId: { cartId: cart.id, productId: product.id } } });
        const quantity = Math.min((existing?.quantity ?? 0) + guest.quantity, Math.max(1, availableOf(product)), 99);
        await tx.cartItem.upsert({
          where: { cartId_productId: { cartId: cart.id, productId: product.id } },
          create: { cartId: cart.id, productId: product.id, quantity, priceAtAdd: product.price, isSelected: guest.selected },
          update: { quantity, ...(guest.selected ? { isSelected: true } : {}) },
        });
      }
    });
    return this.view(userId);
  }

  private async sellableProduct(productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, include: lineInclude.product.include });
    if (!product || !isSellable(product)) throw notFound();
    return product;
  }

  private async item(userId: string, productId: string) {
    const item = await this.prisma.cartItem.findFirst({ where: { productId, cart: { userId } }, include: lineInclude });
    if (!item) throw new ApiError(HttpStatus.NOT_FOUND, 'That item isn’t in your cart.', { code: 'not_in_cart' });
    return item;
  }

  private assertStock(product: ProductRow, quantity: number) {
    const available = availableOf(product);
    if (available === 0) throw new ApiError(HttpStatus.CONFLICT, `${product.name} is out of stock.`, { code: 'out_of_stock' });
    if (quantity > available) {
      throw new ApiError(HttpStatus.CONFLICT, `Only ${available} of ${product.name} left.`, { code: 'insufficient_stock' });
    }
  }
}
