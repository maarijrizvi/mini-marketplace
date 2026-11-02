// Vitest global setup for end-to-end tests: points DATABASE_URL at a separate test database,
// creates it if needed and applies migrations, so tests never wipe development data.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export function testDatabaseUrl() {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
  } catch {
    /* CI sets variables directly */
  }
  return process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL.replace(/\/[^/?]+(\?|$)/, '/mini_marketplace_test$1');
}

export default async function setup() {
  const url = testDatabaseUrl();
  const name = new URL(url).pathname.slice(1);
  const admin = new pg.Client({ connectionString: url.replace(`/${name}`, '/postgres') });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
  if (!exists.rowCount) await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: fileURLToPath(new URL('../apps/api', import.meta.url)),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'ignore',
  });
}
