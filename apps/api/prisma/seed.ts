// Development seed data: categories and one admin. Safe to run repeatedly.
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
}

await main();
await prisma.$disconnect();
