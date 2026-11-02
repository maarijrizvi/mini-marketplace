import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app-setup.js';

// Local runs read the repo-root .env; containers get real environment variables.
if (process.env.NODE_ENV !== 'production') {
  try {
    process.loadEnvFile(new URL('../../../.env', import.meta.url));
  } catch {
    /* no .env file */
  }
}

const app = await NestFactory.create(AppModule);
const config = configureApp(app);
await app.listen(config.API_PORT);
