import { defineConfig } from 'vitest/config';

// Uses the docker-compose Postgres, LocalStack and Mailpit.
export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['../../scripts/test-db.mjs'],
    setupFiles: ['test/load-env.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
  },
});
