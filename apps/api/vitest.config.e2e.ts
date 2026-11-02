import { defineConfig } from 'vitest/config';

// End-to-end tests share one Postgres database, so files run one at a time.
export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['../../scripts/test-db.mjs'],
    setupFiles: ['test/load-env.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
