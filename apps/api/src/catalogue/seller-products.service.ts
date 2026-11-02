import { HttpStatus, Injectable } from '@nestjs/common';
import type { createProductSchema, productUpdateSchema, SessionUser, stockAdjustSchema } from '@mm/shared';
import type { z } from 'zod';
import { ApiError, fieldError } from '../common/http.js';
import { Prisma } from '../generated/prisma/client.js';
import { AuditService } from '../platform/audit.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import { stockState } from './catalogue.service.js';

const productSelect = {
  id: true,
  name: true,
  sku: true,
  price: true,
  description: true,
  isActive: true,
  categoryId: true,
  updatedAt: true,
  stock: { select: { onHand: true, reserved: true } },
} satisfies Prisma.ProductSelect;

type SellerProductRow = Prisma.ProductGetPayload<{ select: typeof productSelect }>;

const view = (p: SellerProductRow) => {
  const onHand = p.stock?.onHand ?? 0;
  const reserved = p.stock?.reserved ?? 0;
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    price: p.price.toFixed(2),
    description: p.description,
    isActive: p.isActive,
    categoryId: p.categoryId,
    onHand,
    reserved,
    available: onHand - reserved,
    stock: stockState(onHand - reserved),
    updatedAt: p.updatedAt.toISOString(),
  };
};

/**
 * A seller's own products. Every query is scoped to the caller's shop, so another seller's
 * product id behaves exactly like one that doesn't exist.
 */
@Injectable()
export class SellerProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async shopOf(user: SessionUser) {
    const shop = await this.prisma.sellerAccount.findUnique({ where: { userId: user.id } });
    if (!shop) throw new ApiError(HttpStatus.FORBIDDEN, 'This account has no shop.', { code: 'forbidden' });
    if (shop.status === 'suspended' || shop.status === 'rejected') {
      throw new ApiError(HttpStatus.FORBIDDEN, 'Your shop can’t change products right now.', { code: 'shop_inactive' });
    }
    return shop;
  }

  private async own(user: SessionUser, productId: string) {
    const shop = await this.shopOf(user);
    const product = await this.prisma.product.findFirst({ where: { id: productId, sellerId: shop.id }, select: productSelect });
    if (!product) throw new ApiError(HttpStatus.NOT_FOUND, 'Product not found.', { code: 'not_found' });
    return { shop, product };
  }

  async list(user: SessionUser) {
    const shop = await this.shopOf(user);
    const rows = await this.prisma.product.findMany({
      where: { sellerId: shop.id },
      select: productSelect,
      orderBy: { createdAt: 'desc' },
    });
    return { shop: { id: shop.id, shopName: shop.shopName, status: shop.status }, products: rows.map(view) };
  }

  async create(user: SessionUser, input: z.output<typeof createProductSchema>) {
    const shop = await this.shopOf(user);
    await this.assertCategory(input.categoryId);
    try {
      const product = await this.prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            sellerId: shop.id,
            categoryId: input.categoryId,
            sku: input.sku,
            name: input.name,
            description: input.description,
            price: input.price,
            isActive: input.isActive,
            stock: { create: { onHand: input.initialStock } },
          },
          select: productSelect,
        });
        if (input.initialStock > 0) {
          await tx.inventoryMovement.create({
            data: { productId: created.id, delta: input.initialStock, reason: 'restock', refId: 'initial', actor: `seller:${shop.id}` },
          });
        }
        await this.audit.record(
          tx,
          { type: 'user', id: user.id },
          'product.created',
          { type: 'product', id: created.id },
          {
            after: { sku: input.sku, price: input.price, stock: input.initialStock },
          },
        );
        return created;
      });
      return view(product);
    } catch (e) {
      throw this.skuConflict(e);
    }
  }

  async update(user: SessionUser, productId: string, input: z.output<typeof productUpdateSchema>) {
    const { product: before } = await this.own(user, productId);
    if (input.categoryId) await this.assertCategory(input.categoryId);
    try {
      const after = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.product.update({ where: { id: productId }, data: input, select: productSelect });
        const priceChanged = input.price !== undefined && !before.price.equals(input.price);
        await this.audit.record(
          tx,
          { type: 'user', id: user.id },
          priceChanged ? 'product.price_changed' : 'product.updated',
          { type: 'product', id: productId },
          {
            before: { price: before.price.toFixed(2), isActive: before.isActive, name: before.name },
            after: { price: updated.price.toFixed(2), isActive: updated.isActive, name: updated.name },
          },
        );
        return updated;
      });
      return view(after);
    } catch (e) {
      throw this.skuConflict(e);
    }
  }

  /**
   * Changes on-hand stock under a row lock, so it can't race a checkout reserving the same units.
   * Stock can't drop below what is already reserved for unpaid orders.
   */
  async adjustStock(user: SessionUser, productId: string, input: z.output<typeof stockAdjustSchema>) {
    const { shop } = await this.own(user, productId);
    const product = await this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ on_hand: number; reserved: number }[]>`
        SELECT on_hand, reserved FROM stock_items WHERE product_id = ${productId}::uuid FOR UPDATE`;
      const onHand = row?.on_hand ?? 0;
      const reserved = row?.reserved ?? 0;
      if (onHand + input.delta < reserved) {
        throw fieldError(
          HttpStatus.CONFLICT,
          'delta',
          `Stock can’t go below the ${reserved} units held for unpaid orders.`,
          'below_reserved',
        );
      }
      await tx.stockItem.upsert({
        where: { productId },
        create: { productId, onHand: onHand + input.delta },
        update: { onHand: onHand + input.delta },
      });
      await tx.inventoryMovement.create({
        data: { productId, delta: input.delta, reason: input.reason, refId: 'manual', actor: `seller:${shop.id}` },
      });
      await this.audit.record(
        tx,
        { type: 'user', id: user.id },
        'stock.adjusted',
        { type: 'product', id: productId },
        {
          before: { onHand },
          after: { onHand: onHand + input.delta, reason: input.reason },
        },
      );
      return tx.product.findUniqueOrThrow({ where: { id: productId }, select: productSelect });
    });
    return view(product);
  }

  async movements(user: SessionUser, productId: string) {
    await this.own(user, productId);
    const rows = await this.prisma.inventoryMovement.findMany({ where: { productId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return rows.map((m) => ({ delta: m.delta, reason: m.reason, ref: m.refId, actor: m.actor, at: m.createdAt.toISOString() }));
  }

  private async assertCategory(categoryId: string) {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category || !category.isVisible) throw fieldError(HttpStatus.BAD_REQUEST, 'categoryId', 'Choose a category.', 'category_invalid');
  }

  private skuConflict(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return fieldError(HttpStatus.CONFLICT, 'sku', 'Another product already uses this SKU.', 'sku_taken');
    }
    return e;
  }
}
