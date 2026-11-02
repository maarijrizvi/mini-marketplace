// Development seed data: categories, one admin and (optionally) demo shops. Safe to run repeatedly.
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client.js';

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  /* CI sets variables directly */
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const categories = ['Kitchen', 'Home', 'Office', 'Apparel', 'Other'];

async function main() {
  for (const name of categories) {
    const slug = name.toLowerCase();
    await prisma.category.upsert({ where: { slug }, update: {}, create: { name, slug } });
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@mini-marketplace.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword) {
    console.log('SEED_ADMIN_PASSWORD not set; skipping the admin account.');
  } else {
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: {
        email: adminEmail,
        phone: process.env.SEED_ADMIN_PHONE ?? '+923000000000',
        fullName: 'Marketplace Admin',
        role: 'admin',
        passwordHash: await argon2.hash(adminPassword, { type: argon2.argon2id }),
        emailVerifiedAt: new Date(),
      },
    });
  }
  console.log(`Seeded ${categories.length} categories${adminPassword ? ` and admin ${adminEmail}` : ''}.`);

  const demoPassword = process.env.SEED_DEMO_PASSWORD;
  if (demoPassword) await seedDemo(await argon2.hash(demoPassword, { type: argon2.argon2id }));
}

// Demo shops and products from the design prototype, so the shop isn't empty locally.
const shops = [
  { email: 'kiln@example.com', phone: '+923001110001', owner: 'E. Novak', shop: 'Kiln & Co.' },
  { email: 'northfield@example.com', phone: '+923001110002', owner: 'H. Brennan', shop: 'Northfield Textiles' },
  { email: 'grainworks@example.com', phone: '+923001110003', owner: 'B. Castillo', shop: 'Grainworks' },
  { email: 'hearthline@example.com', phone: '+923001110004', owner: 'G. Moreau', shop: 'Hearthline' },
  { email: 'lumen@example.com', phone: '+923001110005', owner: 'T. Haddad', shop: 'Lumen Supply' },
];

const products: [shop: string, category: string, name: string, sku: string, price: string, stock: number][] = [
  ['Kiln & Co.', 'Kitchen', 'Ceramic Pour-Over Set', 'KLN-POUR-SET-01', '42.50', 2],
  ['Kiln & Co.', 'Kitchen', 'Stoneware Mug Set of 4', 'KLN-MUG-04', '38.00', 12],
  ['Kiln & Co.', 'Home', 'Ribbed Ceramic Planter', 'KLN-PLNT-RB', '32.00', 14],
  ['Kiln & Co.', 'Kitchen', 'Glazed Serving Bowl', 'KLN-BOWL-GL', '46.00', 7],
  ['Northfield Textiles', 'Home', 'Linen Throw Blanket', 'NFT-THROW-LIN', '68.00', 12],
  ['Northfield Textiles', 'Apparel', 'Merino Crew Socks, 3-pack', 'NFT-SOCK-M3', '24.00', 30],
  ['Northfield Textiles', 'Apparel', 'Waxed Canvas Apron', 'NFT-APRON-WX', '54.00', 6],
  ['Grainworks', 'Office', 'Walnut Desk Organizer', 'GRN-DESK-W', '36.00', 8],
  ['Grainworks', 'Kitchen', 'Olive Wood Serving Board', 'GRN-BOARD-OL', '49.00', 5],
  ['Hearthline', 'Kitchen', 'Cast Iron Skillet, 10 in', 'HRT-SKL-10', '55.00', 0],
  ['Hearthline', 'Home', 'Beeswax Pillar Candles', 'HRT-CNDL-BW', '22.00', 20],
  ['Lumen Supply', 'Office', 'Brass Desk Lamp', 'LMN-LAMP-BR', '129.00', 4],
  ['Lumen Supply', 'Home', 'Linen Lampshade', 'LMN-SHADE-LN', '45.00', 9],
  ['Lumen Supply', 'Office', 'Recycled Paper Notebook', 'LMN-NOTE-RC', '14.00', 40],
];

async function seedDemo(passwordHash: string) {
  const sellerIds = new Map<string, string>();
  for (const s of shops) {
    const user = await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: {
        email: s.email,
        phone: s.phone,
        fullName: s.owner,
        role: 'seller',
        passwordHash,
        emailVerifiedAt: new Date(),
        sellerAccount: {
          create: {
            shopName: s.shop,
            shopNameKey: s.shop.toLowerCase(),
            category: 'Kitchen',
            pickupAddress: 'Karachi',
            status: 'approved',
          },
        },
      },
      include: { sellerAccount: true },
    });
    sellerIds.set(s.shop, user.sellerAccount!.id);
  }
  const cats = new Map((await prisma.category.findMany()).map((c) => [c.name, c.id]));
  for (const [shop, category, name, sku, price, stock] of products) {
    await prisma.product.upsert({
      where: { sku },
      update: {},
      create: { sellerId: sellerIds.get(shop)!, categoryId: cats.get(category)!, name, sku, price, stock: { create: { onHand: stock } } },
    });
  }
  await prisma.user.upsert({
    where: { email: 'alex@example.com' },
    update: {},
    create: {
      email: 'alex@example.com',
      phone: '+923001110100',
      fullName: 'Alex Morgan',
      role: 'customer',
      passwordHash,
      emailVerifiedAt: new Date(),
      addresses: { create: { label: 'Home', line1: '12 Clifton Block 5', city: 'Karachi', postcode: '75600', isDefault: true } },
    },
  });
  console.log(`Seeded ${shops.length} demo shops, ${products.length} products and customer alex@example.com.`);
}

await main();
await prisma.$disconnect();
