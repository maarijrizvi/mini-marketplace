import { ReservationSweeper } from '../src/ordering/reservation-sweeper.js';
import { address, category, key, product, resetDatabase, signedIn, startApp, type Harness } from './helpers.js';

let h: Harness;

beforeAll(async () => {
  h = await startApp();
});

beforeEach(async () => {
  await resetDatabase(h.prisma);
});

afterAll(async () => {
  await h.app.close();
});

/** Two approved shops, one pending shop and a few products. */
async function world() {
  const kitchen = await category(h, 'Kitchen');
  const hidden = await category(h, 'Seasonal', false);
  const kiln = await signedIn(h, 'kiln@example.com', 'seller', { name: 'Kiln & Co.' });
  const north = await signedIn(h, 'north@example.com', 'seller', { name: 'Northfield' });
  const draft = await signedIn(h, 'draft@example.com', 'seller', { name: 'Draft Shop', status: 'pending' });
  const kilnId = kiln.user.sellerAccount!.id;
  const northId = north.user.sellerAccount!.id;
  const pourOver = await product(h, kilnId, kitchen.id, { name: 'Ceramic Pour-Over Set', price: '42.50', stock: 1 });
  const mugs = await product(h, kilnId, kitchen.id, { name: 'Stoneware Mug Set', price: '38.00', stock: 10 });
  const throwBlanket = await product(h, northId, kitchen.id, { name: 'Linen Throw Blanket', price: '68.00', stock: 5 });
  await product(h, kilnId, kitchen.id, { name: 'Old Teapot', price: '20.00', stock: 3, isActive: false });
  await product(h, draft.user.sellerAccount!.id, kitchen.id, { name: 'Draft Vase', price: '15.00', stock: 3 });
  await product(h, northId, hidden.id, { name: 'Holiday Wreath', price: '30.00', stock: 3 });
  return { kiln, north, kilnId, pourOver, mugs, throwBlanket };
}

async function buyer(email = 'alex@example.com') {
  const { cookie, user } = await signedIn(h, email);
  return { cookie, user, addressId: await address(h, cookie) };
}

async function addAndSelect(cookie: string[], productId: string, quantity = 1) {
  await h.http().post('/api/cart/items').set('Cookie', cookie).send({ productId, quantity }).expect(201);
  await h.http().patch(`/api/cart/items/${productId}`).set('Cookie', cookie).send({ selected: true }).expect(200);
}

describe('catalogue', () => {
  it('lists only products that can be bought, with search, filters and sorting', async () => {
    await world();
    const all = await h.http().get('/api/catalogue/products').expect(200);
    expect(all.body.items.map((p: { name: string }) => p.name).sort()).toEqual([
      'Ceramic Pour-Over Set',
      'Linen Throw Blanket',
      'Stoneware Mug Set',
    ]);
    expect(all.body.items.find((p: { name: string }) => p.name === 'Ceramic Pour-Over Set').stock).toBe('low');

    const search = await h.http().get('/api/catalogue/products?q=northfield').expect(200);
    expect(search.body.items.map((p: { name: string }) => p.name)).toEqual(['Linen Throw Blanket']);

    const cheap = await h.http().get('/api/catalogue/products?maxPrice=40&sort=price_asc').expect(200);
    expect(cheap.body.items.map((p: { price: string }) => p.price)).toEqual(['38.00']);

    const sorted = await h.http().get('/api/catalogue/products?sort=price_desc').expect(200);
    expect(sorted.body.items.map((p: { price: string }) => p.price)).toEqual(['68.00', '42.50', '38.00']);
  });
});

describe('seller products', () => {
  it('lets a seller manage only their own products, and records price changes', async () => {
    const { kiln, north, mugs, throwBlanket } = await world();
    await h.http().patch(`/api/seller/products/${throwBlanket.id}`).set('Cookie', kiln.cookie).send({ price: '1.00' }).expect(404);
    await h.http().post(`/api/seller/products/${throwBlanket.id}/stock`).set('Cookie', kiln.cookie).send({ delta: 5 }).expect(404);

    await h.http().patch(`/api/seller/products/${mugs.id}`).set('Cookie', kiln.cookie).send({ price: '40.00' }).expect(200);
    const audit = await h.prisma.auditLog.findFirstOrThrow({ where: { action: 'product.price_changed' } });
    expect(audit.before).toMatchObject({ price: '38.00' });
    expect(audit.after).toMatchObject({ price: '40.00' });

    const own = await h.http().get('/api/seller/products').set('Cookie', north.cookie).expect(200);
    expect(own.body.products.map((p: { name: string }) => p.name)).toEqual(['Holiday Wreath', 'Linen Throw Blanket']);
  });

  it('rejects a duplicate SKU and keeps stock above what unpaid orders hold', async () => {
    const { kiln, mugs } = await world();
    const categoryId = mugs.categoryId;
    const dupe = await h
      .http()
      .post('/api/seller/products')
      .set('Cookie', kiln.cookie)
      .send({ name: 'Copy', sku: mugs.sku, categoryId, price: '10' })
      .expect(409);
    expect(dupe.body.fieldErrors.sku).toEqual(['Another product already uses this SKU.']);

    const alex = await buyer();
    await addAndSelect(alex.cookie, mugs.id, 4);
    await h
      .http()
      .post('/api/checkout')
      .set('Cookie', alex.cookie)
      .send({ addressId: alex.addressId, idempotencyKey: key(), paymentOutcome: 'pending' })
      .expect(201);
    const res = await h.http().post(`/api/seller/products/${mugs.id}/stock`).set('Cookie', kiln.cookie).send({ delta: -8 }).expect(409);
    expect(res.body.fieldErrors.delta[0]).toContain('4 units held');
  });
});

describe('cart', () => {
  it('belongs to customers only', async () => {
    const { kiln } = await world();
    await h.http().get('/api/cart').set('Cookie', kiln.cookie).expect(403);
    await h.http().get('/api/cart').expect(401);
  });

  it('caps quantities at available stock and flags price changes', async () => {
    const { mugs, pourOver } = await world();
    const { cookie } = await buyer();
    const tooMany = await h.http().post('/api/cart/items').set('Cookie', cookie).send({ productId: pourOver.id, quantity: 2 }).expect(409);
    expect(tooMany.body.message).toBe('Only 1 of Ceramic Pour-Over Set left.');

    await h.http().post('/api/cart/items').set('Cookie', cookie).send({ productId: mugs.id, quantity: 2 }).expect(201);
    await h.prisma.product.update({ where: { id: mugs.id }, data: { price: '41.00' } });
    const cart = await h.http().get('/api/cart').set('Cookie', cookie).expect(200);
    expect(cart.body.lines[0]).toMatchObject({ unitPrice: '41.00', previousPrice: '38.00', lineTotal: '82.00', selected: false });
    expect(cart.body.selectedSubtotal).toBe('0.00');
  });

  it('merges a guest cart at sign-in, keeping the guest’s ticks as the selection', async () => {
    const { mugs, throwBlanket } = await world();
    const { cookie } = await buyer();
    await addAndSelect(cookie, mugs.id);
    const merged = await h
      .http()
      .post('/api/cart/merge')
      .set('Cookie', cookie)
      .send({ items: [{ productId: throwBlanket.id, quantity: 2, selected: true }] })
      .expect(201);
    const byName = Object.fromEntries(merged.body.lines.map((l: { name: string; selected: boolean }) => [l.name, l.selected]));
    expect(byName).toEqual({ 'Stoneware Mug Set': false, 'Linen Throw Blanket': true });
  });
});

describe('checkout', () => {
  it('places a multi-seller order for the selected items only, one parcel per seller', async () => {
    const { mugs, throwBlanket, pourOver } = await world();
    const alex = await buyer();
    await addAndSelect(alex.cookie, mugs.id, 2);
    await addAndSelect(alex.cookie, throwBlanket.id);
    await h.http().post('/api/cart/items').set('Cookie', alex.cookie).send({ productId: pourOver.id }).expect(201); // not selected

    const quote = await h.http().post('/api/checkout/quote').set('Cookie', alex.cookie).send({ promoCode: 'welcome10' }).expect(201);
    expect(quote.body).toMatchObject({ subtotal: '144.00', discount: '14.40', shipping: '10.00', total: '139.60' });

    const res = await h
      .http()
      .post('/api/checkout')
      .set('Cookie', alex.cookie)
      .send({ addressId: alex.addressId, idempotencyKey: key(), promoCode: 'WELCOME10', expectedTotal: '139.60' })
      .expect(201);
    const order = res.body.order;
    expect(order).toMatchObject({ status: 'placed', total: '139.60', payment: { status: 'succeeded' } });
    expect(order.shipments).toHaveLength(2);

    const stock = await h.prisma.stockItem.findUniqueOrThrow({ where: { productId: mugs.id } });
    expect(stock).toMatchObject({ onHand: 8, reserved: 0 });
    const cart = await h.http().get('/api/cart').set('Cookie', alex.cookie).expect(200);
    expect(cart.body.lines.map((l: { name: string }) => l.name)).toEqual(['Ceramic Pour-Over Set']);
    expect(await h.prisma.outboxEvent.count({ where: { eventType: 'ordering.order_placed' } })).toBe(1);
  });

  it('keeps the price paid when the seller changes the price later', async () => {
    const { kiln, mugs } = await world();
    const alex = await buyer();
    await addAndSelect(alex.cookie, mugs.id);
    const res = await h
      .http()
      .post('/api/checkout')
      .set('Cookie', alex.cookie)
      .send({ addressId: alex.addressId, idempotencyKey: key() })
      .expect(201);
    await h.http().patch(`/api/seller/products/${mugs.id}`).set('Cookie', kiln.cookie).send({ price: '99.00' }).expect(200);

    const order = await h.http().get(`/api/orders/${res.body.order.id}`).set('Cookie', alex.cookie).expect(200);
    expect(order.body.shipments[0].items[0]).toMatchObject({ unitPrice: '38.00', lineTotal: '38.00' });
    expect(order.body.total).toBe('43.00');
  });

  it('turns repeated submissions with the same key into one order, even at the same moment', async () => {
    const { mugs } = await world();
    const alex = await buyer();
    await addAndSelect(alex.cookie, mugs.id);
    const body = { addressId: alex.addressId, idempotencyKey: key() };
    const [a, b] = await Promise.all([
      h.http().post('/api/checkout').set('Cookie', alex.cookie).send(body),
      h.http().post('/api/checkout').set('Cookie', alex.cookie).send(body),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.order.id).toBe(b.body.order.id);
    const again = await h.http().post('/api/checkout').set('Cookie', alex.cookie).send(body).expect(200);
    expect(again.body.replayed).toBe(true);
    expect(await h.prisma.order.count()).toBe(1);
    expect(await h.prisma.payment.count()).toBe(1);
  });

  it('never sells the last unit twice when shoppers check out at the same moment', async () => {
    const { pourOver } = await world();
    const shoppers = await Promise.all(['a', 'b', 'c', 'd', 'e'].map((n) => buyer(`${n}@example.com`)));
    for (const s of shoppers) await addAndSelect(s.cookie, pourOver.id);

    const results = await Promise.all(
      shoppers.map((s) => h.http().post('/api/checkout').set('Cookie', s.cookie).send({ addressId: s.addressId, idempotencyKey: key() })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.code === 'insufficient_stock')).toBe(true);
    const stock = await h.prisma.stockItem.findUniqueOrThrow({ where: { productId: pourOver.id } });
    expect(stock).toMatchObject({ onHand: 0, reserved: 0 });
  });

  it('releases stock when payment fails, and keeps the items in the cart to try again', async () => {
    const { mugs } = await world();
    const alex = await buyer();
    await addAndSelect(alex.cookie, mugs.id, 3);
    const res = await h
      .http()
      .post('/api/checkout')
      .set('Cookie', alex.cookie)
      .send({ addressId: alex.addressId, idempotencyKey: key(), paymentOutcome: 'failure' })
      .expect(201);
    expect(res.body.order).toMatchObject({ status: 'payment_failed', payment: { status: 'failed' } });
    expect(res.body.order.shipments[0].status).toBe('cancelled');
    expect(await h.prisma.stockItem.findUniqueOrThrow({ where: { productId: mugs.id } })).toMatchObject({ onHand: 10, reserved: 0 });
    const cart = await h.http().get('/api/cart').set('Cookie', alex.cookie).expect(200);
    expect(cart.body.selectedCount).toBe(3);
  });

  it('holds stock while a payment is unconfirmed, then releases it when the hold expires', async () => {
    const { mugs } = await world();
    const alex = await buyer();
    await addAndSelect(alex.cookie, mugs.id, 2);
    const res = await h
      .http()
      .post('/api/checkout')
      .set('Cookie', alex.cookie)
      .send({ addressId: alex.addressId, idempotencyKey: key(), paymentOutcome: 'unknown' })
      .expect(201);
    expect(res.body.order).toMatchObject({ status: 'pending_payment', payment: { status: 'unknown', reference: null } });
    expect(await h.prisma.stockItem.findUniqueOrThrow({ where: { productId: mugs.id } })).toMatchObject({ onHand: 10, reserved: 2 });

    const sweeper = h.app.get(ReservationSweeper);
    expect(await sweeper.sweep(new Date())).toBe(0); // not expired yet
    expect(await sweeper.sweep(new Date(Date.now() + 16 * 60_000))).toBe(1);
    expect(await h.prisma.stockItem.findUniqueOrThrow({ where: { productId: mugs.id } })).toMatchObject({ onHand: 10, reserved: 0 });
    const order = await h.http().get(`/api/orders/${res.body.order.id}`).set('Cookie', alex.cookie).expect(200);
    expect(order.body.status).toBe('payment_failed');
  });

  it('stops and asks for a review when prices changed after the shopper saw the total', async () => {
    const { mugs } = await world();
    const alex = await buyer();
    await addAndSelect(alex.cookie, mugs.id);
    const res = await h
      .http()
      .post('/api/checkout')
      .set('Cookie', alex.cookie)
      .send({ addressId: alex.addressId, idempotencyKey: key(), expectedTotal: '40.00' })
      .expect(409);
    expect(res.body.code).toBe('prices_changed');
    expect(await h.prisma.order.count()).toBe(0);
  });

  it('refuses items that stopped being sellable after they were selected', async () => {
    const { kiln, mugs } = await world();
    const alex = await buyer();
    await addAndSelect(alex.cookie, mugs.id);
    await h.http().patch(`/api/seller/products/${mugs.id}`).set('Cookie', kiln.cookie).send({ isActive: false }).expect(200);
    await h.http().post('/api/checkout').set('Cookie', alex.cookie).send({ addressId: alex.addressId, idempotencyKey: key() }).expect(409);
  });
});

describe('orders', () => {
  it('lets customers see only their own orders', async () => {
    const { mugs } = await world();
    const alex = await buyer('alex@example.com');
    const sam = await buyer('sam@example.com');
    await addAndSelect(alex.cookie, mugs.id);
    const placed = await h
      .http()
      .post('/api/checkout')
      .set('Cookie', alex.cookie)
      .send({ addressId: alex.addressId, idempotencyKey: key() })
      .expect(201);

    await h.http().get(`/api/orders/${placed.body.order.id}`).set('Cookie', sam.cookie).expect(404);
    expect((await h.http().get('/api/orders').set('Cookie', sam.cookie).expect(200)).body).toEqual([]);
    expect((await h.http().get('/api/orders').set('Cookie', alex.cookie).expect(200)).body).toHaveLength(1);
  });
});
