import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app-setup.js';
import { PrismaService } from '../src/platform/prisma.service.js';

let app: INestApplication;
let prisma: PrismaService;
const http = () => request(app.getHttpServer());

const customer = {
  fullName: 'Alex Morgan',
  email: 'alex@example.com',
  phone: '0300 1234567',
  password: 'Secret123',
  acceptTerms: true,
};

/** Reads the code the worker would email, straight from the outbox. */
async function latestCode(email: string) {
  const events = await prisma.outboxEvent.findMany({
    where: { eventType: 'identity.email_verification_requested' },
    orderBy: { createdAt: 'desc' },
  });
  const event = events.find((e) => (e.payload as { payload: { email: string } }).payload.email === email);
  return (event!.payload as { payload: { code: string } }).payload.code;
}

async function signUpAndVerify(body = customer) {
  await http().post('/api/auth/signup').send(body).expect(201);
  const res = await http()
    .post('/api/auth/verify-email')
    .send({ email: body.email, code: await latestCode(body.email) })
    .expect(200);
  return res.headers['set-cookie'] as unknown as string[];
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  prisma = app.get(PrismaService);
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE users, categories, outbox_events, audit_log RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await app.close();
});

describe('sign-up and email verification', () => {
  it('creates an unverified account, emails a code, and signs in once verified', async () => {
    await http().post('/api/auth/signup').send(customer).expect(201);

    const blocked = await http().post('/api/auth/signin').send({ email: customer.email, password: customer.password }).expect(403);
    expect(blocked.body.code).toBe('email_unverified');

    const code = await latestCode(customer.email);
    const wrong = code === '000000' ? '111111' : '000000';
    const bad = await http().post('/api/auth/verify-email').send({ email: customer.email, code: wrong }).expect(400);
    expect(bad.body.fieldErrors.code[0]).toContain('4 tries left');

    const ok = await http().post('/api/auth/verify-email').send({ email: customer.email, code }).expect(200);
    expect(ok.body.user).toMatchObject({ email: 'alex@example.com', phone: '+923001234567', role: 'customer', seller: null });

    const cookie = ok.headers['set-cookie'] as unknown as string[];
    expect(cookie[0]).toMatch(/mm_sid=.+HttpOnly/);
    const me = await http().get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.user.email).toBe('alex@example.com');
  });

  it('rejects an email or phone already in use, whatever case or format', async () => {
    await http().post('/api/auth/signup').send(customer).expect(201);

    const email = await http()
      .post('/api/auth/signup')
      .send({ ...customer, email: 'ALEX@example.com', phone: '0300 7654321' })
      .expect(409);
    expect(email.body.fieldErrors.email).toEqual(['An account already uses this email.']);

    const phone = await http()
      .post('/api/auth/signup')
      .send({ ...customer, email: 'other@example.com', phone: '+92-300-123-4567' })
      .expect(409);
    expect(phone.body.fieldErrors.phone).toEqual(['An account already uses this phone number.']);
  });

  it('lets only one of two simultaneous sign-ups with the same email through', async () => {
    const results = await Promise.all([
      http().post('/api/auth/signup').send(customer),
      http()
        .post('/api/auth/signup')
        .send({ ...customer, phone: '0300 7654321' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.user.count()).toBe(1);
  });

  it('explains every invalid field', async () => {
    const res = await http()
      .post('/api/auth/signup')
      .send({ fullName: '', email: 'nope', phone: '123', password: 'short', acceptTerms: false })
      .expect(400);
    expect(Object.keys(res.body.fieldErrors).sort()).toEqual(['acceptTerms', 'email', 'fullName', 'password', 'phone']);
  });
});

describe('sign-in', () => {
  it('pauses sign-in after five wrong passwords, even for the right password', async () => {
    await signUpAndVerify();
    for (let i = 1; i <= 4; i++) {
      await http().post('/api/auth/signin').send({ email: customer.email, password: 'Wrong1234' }).expect(401);
    }
    const locked = await http().post('/api/auth/signin').send({ email: customer.email, password: 'Wrong1234' }).expect(423);
    expect(locked.body.code).toBe('locked');
    await http().post('/api/auth/signin').send({ email: customer.email, password: customer.password }).expect(423);
    expect(await prisma.auditLog.count({ where: { action: 'user.locked' } })).toBe(1);
  });

  it('gives the same answer for an unknown email and a wrong password', async () => {
    await signUpAndVerify();
    const unknown = await http().post('/api/auth/signin').send({ email: 'nobody@example.com', password: 'Secret123' }).expect(401);
    const wrong = await http().post('/api/auth/signin').send({ email: customer.email, password: 'Nope12345' }).expect(401);
    expect(unknown.body.message).toBe(wrong.body.message);
  });

  it('ends the session on sign-out', async () => {
    const cookie = await signUpAndVerify();
    await http().post('/api/auth/signout').set('Cookie', cookie).expect(204);
    await http().get('/api/auth/me').set('Cookie', cookie).expect(401);
  });

  it('blocks suspended accounts, including their existing sessions', async () => {
    const cookie = await signUpAndVerify();
    await prisma.user.update({ where: { email: customer.email }, data: { status: 'suspended' } });
    await http().get('/api/auth/me').set('Cookie', cookie).expect(401);
    const res = await http().post('/api/auth/signin').send({ email: customer.email, password: customer.password }).expect(403);
    expect(res.body.code).toBe('suspended');
  });
});

describe('password reset', () => {
  it('resets once, unlocks the account and signs out every device', async () => {
    const oldCookie = await signUpAndVerify();
    await http().post('/api/auth/forgot-password').send({ email: customer.email }).expect(202);
    const event = await prisma.outboxEvent.findFirstOrThrow({ where: { eventType: 'identity.password_reset_requested' } });
    const token = new URL((event.payload as { payload: { resetUrl: string } }).payload.resetUrl).searchParams.get('token')!;

    await http().post('/api/auth/reset-password').send({ token, password: 'Secret123' }).expect(400); // same as before
    await http().post('/api/auth/reset-password').send({ token, password: 'NewPass456' }).expect(204);
    await http().post('/api/auth/reset-password').send({ token, password: 'Another789' }).expect(410);

    await http().get('/api/auth/me').set('Cookie', oldCookie).expect(401);
    await http().post('/api/auth/signin').send({ email: customer.email, password: 'NewPass456' }).expect(200);
  });

  it('answers the same for an unknown email', async () => {
    await http().post('/api/auth/forgot-password').send({ email: 'nobody@example.com' }).expect(202);
    expect(await prisma.outboxEvent.count()).toBe(0);
  });
});

describe('seller registration', () => {
  const seller = {
    fullName: 'Kiln Owner',
    email: 'kiln@example.com',
    phone: '0321 7654321',
    password: 'Seller456',
    acceptTerms: true,
    shopName: 'Kiln & Co.',
    category: 'Kitchen',
    pickupAddress: '1 Pottery Lane, Karachi',
  };

  it('creates a separate seller login with a pending shop, linked to the signed-in customer', async () => {
    const customerCookie = await signUpAndVerify();
    await http().post('/api/auth/seller-signup').set('Cookie', customerCookie).send(seller).expect(201);
    const res = await http()
      .post('/api/auth/verify-email')
      .send({ email: seller.email, code: await latestCode(seller.email) })
      .expect(200);
    expect(res.body.user).toMatchObject({ role: 'seller', seller: { shopName: 'Kiln & Co.', status: 'pending' } });

    const shop = await prisma.sellerAccount.findFirstOrThrow({ include: { registeredBy: true } });
    expect(shop.registeredBy?.email).toBe(customer.email);
    expect(await prisma.outboxEvent.count({ where: { eventType: 'identity.seller_applied' } })).toBe(1);
  });

  it('refuses the customer’s own email or phone, and a shop name already taken', async () => {
    const customerCookie = await signUpAndVerify();
    const ownEmail = await http()
      .post('/api/auth/seller-signup')
      .set('Cookie', customerCookie)
      .send({ ...seller, email: customer.email })
      .expect(409);
    expect(ownEmail.body.fieldErrors.email[0]).toContain('different email');
    const ownPhone = await http()
      .post('/api/auth/seller-signup')
      .set('Cookie', customerCookie)
      .send({ ...seller, phone: '+923001234567' })
      .expect(409);
    expect(ownPhone.body.fieldErrors.phone[0]).toContain('different phone');

    await http().post('/api/auth/seller-signup').send(seller).expect(201);
    const dupe = await http()
      .post('/api/auth/seller-signup')
      .send({ ...seller, email: 'other@example.com', phone: '0333 1112223', shopName: 'KILN & CO.' })
      .expect(409);
    expect(dupe.body.fieldErrors.shopName).toEqual(['Another shop already uses this name.']);
  });
});

describe('health', () => {
  it('reports ready when the database answers', async () => {
    await http().get('/api/health/ready').expect(200, { status: 'ok', database: 'ok' });
  });
});
