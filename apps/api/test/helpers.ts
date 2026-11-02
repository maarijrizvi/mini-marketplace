import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app-setup.js';
import { PrismaService } from '../src/platform/prisma.service.js';

export interface Harness {
  app: INestApplication;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
}

export async function startApp(): Promise<Harness> {
  process.env.RESERVATION_SWEEP = 'off'; // tests call the sweeper directly
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService), http: () => request(app.getHttpServer()) };
}

export async function resetDatabase(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(`TRUNCATE users, categories, outbox_events, audit_log, processed_messages RESTART IDENTITY CASCADE`);
}

const PASSWORD = 'Secret123';
let phoneSeq = 1000000;
const hash = argon2.hash(PASSWORD, { type: argon2.argon2id });

/** Creates a verified user directly in the database and signs in through the API. Returns the session cookie. */
export async function signedIn(
  h: Harness,
  email: string,
  role: 'customer' | 'seller' | 'admin' = 'customer',
  shop?: { name: string; status?: 'pending' | 'approved' },
) {
  const user = await h.prisma.user.create({
    data: {
      email,
      phone: `+92300${phoneSeq++}`,
      fullName: email.split('@')[0],
      passwordHash: await hash,
      role,
      emailVerifiedAt: new Date(),
      sellerAccount: shop
        ? {
            create: {
              shopName: shop.name,
              shopNameKey: shop.name.toLowerCase(),
              category: 'Kitchen',
              pickupAddress: '1 Test Road',
              status: shop.status ?? 'approved',
            },
          }
        : undefined,
    },
    include: { sellerAccount: true },
  });
  const res = await h.http().post('/api/auth/signin').send({ email, password: PASSWORD }).expect(200);
  return { user, cookie: res.headers['set-cookie'] as unknown as string[] };
}

export async function category(h: Harness, name = 'Kitchen', isVisible = true) {
  return h.prisma.category.create({ data: { name, slug: name.toLowerCase(), isVisible } });
}

/** A product with stock, straight into the database. */
export async function product(
  h: Harness,
  sellerId: string,
  categoryId: string,
  o: { name: string; price: string; stock: number; sku?: string; isActive?: boolean },
) {
  return h.prisma.product.create({
    data: {
      sellerId,
      categoryId,
      name: o.name,
      sku:
        o.sku ??
        o.name
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, '-')
          .slice(0, 30),
      price: o.price,
      isActive: o.isActive ?? true,
      stock: { create: { onHand: o.stock } },
    },
  });
}

export async function address(h: Harness, cookie: string[]) {
  const res = await h
    .http()
    .post('/api/addresses')
    .set('Cookie', cookie)
    .send({ label: 'Home', line1: '1 Test Street', city: 'Karachi' })
    .expect(201);
  return res.body.id as string;
}

export const key = () => `test-${crypto.randomUUID()}`;
