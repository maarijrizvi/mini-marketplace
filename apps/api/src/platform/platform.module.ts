import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, loadConfig } from '../config.js';
import { AuditService } from './audit.service.js';
import { OutboxService } from './outbox.service.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig() }, PrismaService, OutboxService, AuditService],
  exports: [APP_CONFIG, PrismaService, OutboxService, AuditService],
})
export class PlatformModule {}
