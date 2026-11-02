// Runs in each test worker: same settings as development, but the separate test database.
import { testDatabaseUrl } from '../../../scripts/test-db.mjs';

process.env.DATABASE_URL = testDatabaseUrl();
