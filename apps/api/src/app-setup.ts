import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { APP_CONFIG, type AppConfig } from './config.js';

/** Shared by main.ts and the end-to-end tests, so tests exercise the same middleware. */
export function configureApp(app: INestApplication) {
  const config = app.get<AppConfig>(APP_CONFIG);
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.WEB_ORIGIN, credentials: true });
  app.enableShutdownHooks();
  // Behind the Kubernetes ingress, the client IP arrives in X-Forwarded-For.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  return config;
}
