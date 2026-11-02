import { defineConfig } from 'prisma/config';

// Local development reads the repo-root .env; CI and Kubernetes set DATABASE_URL directly.
try {
  process.loadEnvFile('../../.env');
} catch {
  /* no .env file */
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
