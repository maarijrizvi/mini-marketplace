import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiError } from '../common/http.js';
import { Public } from '../identity/auth.guard.js';
import { PrismaService } from '../platform/prisma.service.js';

/** Kubernetes probes: liveness says the process is up, readiness says it can serve (database reachable). */
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'ok' };
    } catch {
      throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'Database unavailable', { code: 'not_ready' });
    }
  }
}
