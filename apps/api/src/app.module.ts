import { Module } from '@nestjs/common';
import { CommerceModule } from './commerce.module.js';
import { HealthController } from './health/health.controller.js';
import { IdentityModule } from './identity/identity.module.js';
import { PlatformModule } from './platform/platform.module.js';

@Module({
  imports: [PlatformModule, IdentityModule, CommerceModule],
  controllers: [HealthController],
})
export class AppModule {}
