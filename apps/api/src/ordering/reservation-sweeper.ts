import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../platform/prisma.service.js';
import { SettlementService } from './settlement.service.js';

const SWEEP_EVERY_MS = 60_000;

/**
 * Failed, abandoned or timed-out payments must not hold stock forever. Every minute, payments
 * still unresolved after their reservation expired are treated as failed, which releases the
 * stock. Rows are claimed with SKIP LOCKED, so several API replicas can sweep safely.
 * (When a real provider exists, this would ask it for the result before giving up.)
 */
@Injectable()
export class ReservationSweeper implements OnModuleInit, OnApplicationShutdown {
  private readonly log = new Logger(ReservationSweeper.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settlement: SettlementService,
  ) {}

  onModuleInit() {
    if (process.env.RESERVATION_SWEEP === 'off') return;
    this.timer = setInterval(() => void this.sweep().catch((e) => this.log.error(e)), SWEEP_EVERY_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  /** Returns how many payments were expired. */
  async sweep(now = new Date()): Promise<number> {
    const expired = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT p.id FROM payments p
        JOIN stock_reservations r ON r.order_id = p.order_id
       WHERE p.status IN ('pending', 'unknown') AND r.status = 'held' AND r.expires_at < ${now}
       LIMIT 100`;
    let count = 0;
    for (const { id } of expired) {
      if (await this.settlement.settle(id, 'failed', null, { type: 'system', id: 'reservation-sweeper' }, 'Payment not confirmed in time'))
        count++;
    }
    if (count) this.log.log(`Released stock for ${count} expired payment(s)`);
    return count;
  }
}
