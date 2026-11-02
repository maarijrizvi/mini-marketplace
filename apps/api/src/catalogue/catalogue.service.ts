import { HttpStatus, Injectable } from '@nestjs/common';
import type { CataloguePage, CatalogueQuery, ProductDetail, ProductSummary, StockState } from '@mm/shared';
import { catalogueQuerySchema } from '@mm/shared';
import type { z } from 'zod';
import { ApiError } from '../common/http.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../platform/prisma.service.js';

export const LOW_STOCK = 3;

/** A product can be bought when it is active, its shop is approved and its category is visible. */
export const SELLABLE = Prisma.sql`p.is_active AND s.status = 'approved' AND c.is_visible`;

export const stockState = (available: number): StockState => (available <= 0 ? 'out' : available <= LOW_STOCK ? 'low' : 'in_stock');

interface Row {
  id: string;
  name: string;
  sku: string;
  price: string;
  category_id: string;
  category_name: string;
  category_slug: string;
  seller_id: string;
  shop_name: string;
  available: number;
  total: bigint;
}

const toSummary = (r: Row): ProductSummary => ({
  id: r.id,
  name: r.name,
  sku: r.sku,
  price: r.price,
  category: { id: r.category_id, name: r.category_name, slug: r.category_slug },
  seller: { id: r.seller_id, shopName: r.shop_name },
  available: Math.max(0, r.available),
  stock: stockState(r.available),
});

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

@Injectable()
export class CatalogueService {
  constructor(private readonly prisma: PrismaService) {}

  async list(raw: CatalogueQuery): Promise<CataloguePage> {
    const q: z.output<typeof catalogueQuerySchema> = catalogueQuerySchema.parse(raw);
    const search = q.q
      ? Prisma.sql`(p.name ILIKE ${`%${escapeLike(q.q)}%`} OR s.shop_name ILIKE ${`%${escapeLike(q.q)}%`} OR p.sku ILIKE ${`%${escapeLike(q.q)}%`})`
      : Prisma.sql`TRUE`;
    const filters = [SELLABLE, search];
    if (q.category) filters.push(Prisma.sql`c.slug = ${q.category}`);
    if (q.seller) filters.push(Prisma.sql`s.id::text = ${q.seller}`);
    if (q.minPrice !== undefined) filters.push(Prisma.sql`p.price >= ${q.minPrice}`);
    if (q.maxPrice !== undefined) filters.push(Prisma.sql`p.price <= ${q.maxPrice}`);
    if (q.inStock === 'true') filters.push(Prisma.sql`COALESCE(st.on_hand - st.reserved, 0) > 0`);

    const order = {
      relevance: Prisma.sql`(COALESCE(st.on_hand - st.reserved, 0) > 0) DESC, p.created_at DESC`,
      newest: Prisma.sql`p.created_at DESC`,
      price_asc: Prisma.sql`p.price ASC, p.created_at DESC`,
      price_desc: Prisma.sql`p.price DESC, p.created_at DESC`,
    }[q.sort];

    const from = Prisma.sql`
      FROM products p
      JOIN seller_accounts s ON s.id = p.seller_id
      JOIN categories c ON c.id = p.category_id
      LEFT JOIN stock_items st ON st.product_id = p.id`;

    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT p.id, p.name, p.sku, p.price::text AS price,
             c.id AS category_id, c.name AS category_name, c.slug AS category_slug,
             s.id AS seller_id, s.shop_name,
             COALESCE(st.on_hand - st.reserved, 0)::int AS available,
             COUNT(*) OVER () AS total
      ${from}
      WHERE ${Prisma.join(filters, ' AND ')}
      ORDER BY ${order}
      LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`;

    // Facet counts follow the search text only, so picking a category doesn't hide the others.
    const [categories, sellers] = await Promise.all([
      this.prisma.$queryRaw<{ slug: string; name: string; count: bigint }[]>`
        SELECT c.slug, c.name, COUNT(*) AS count ${from}
        WHERE ${SELLABLE} AND ${search} GROUP BY c.slug, c.name ORDER BY c.name`,
      this.prisma.$queryRaw<{ id: string; shop_name: string; count: bigint }[]>`
        SELECT s.id, s.shop_name, COUNT(*) AS count ${from}
        WHERE ${SELLABLE} AND ${search} GROUP BY s.id, s.shop_name ORDER BY s.shop_name`,
    ]);

    return {
      items: rows.map(toSummary),
      total: rows.length ? Number(rows[0].total) : 0,
      page: q.page,
      pageSize: q.pageSize,
      facets: {
        categories: categories.map((c) => ({ slug: c.slug, name: c.name, count: Number(c.count) })),
        sellers: sellers.map((s) => ({ id: s.id, shopName: s.shop_name, count: Number(s.count) })),
      },
    };
  }

  async get(id: string): Promise<ProductDetail> {
    const rows = await this.prisma.$queryRaw<(Row & { description: string })[]>`
      SELECT p.id, p.name, p.sku, p.price::text AS price, p.description,
             c.id AS category_id, c.name AS category_name, c.slug AS category_slug,
             s.id AS seller_id, s.shop_name,
             COALESCE(st.on_hand - st.reserved, 0)::int AS available, 1::bigint AS total
      FROM products p
      JOIN seller_accounts s ON s.id = p.seller_id
      JOIN categories c ON c.id = p.category_id
      LEFT JOIN stock_items st ON st.product_id = p.id
      WHERE p.id = ${id}::uuid AND ${SELLABLE}`;
    if (!rows.length) throw new ApiError(HttpStatus.NOT_FOUND, 'This product isn’t available.', { code: 'not_found' });
    const images = await this.prisma.productImage.findMany({ where: { productId: id }, orderBy: { position: 'asc' } });
    return {
      ...toSummary(rows[0]),
      description: rows[0].description,
      images: images.map((i) => ({ key: i.objectKey, position: i.position })),
    };
  }

  categories() {
    return this.prisma.category.findMany({
      where: { isVisible: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true },
    });
  }
}
