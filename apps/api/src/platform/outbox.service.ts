import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { EventEnvelope, EventPayloads, EventType } from '@mm/shared';
import type { Tx } from './prisma.service.js';

/**
 * Records events in the outbox table inside the caller's transaction. If the transaction rolls
 * back, the event disappears with it; if it commits, the worker is guaranteed to publish it.
 */
@Injectable()
export class OutboxService {
  async add<T extends EventType>(tx: Tx, aggregate: { type: string; id: string }, type: T, payload: EventPayloads[T]) {
    const id = randomUUID();
    const envelope: EventEnvelope<T> = { messageId: id, type, version: 1, occurredAt: new Date().toISOString(), payload };
    await tx.outboxEvent.create({
      data: { id, aggregateType: aggregate.type, aggregateId: aggregate.id, eventType: type, payload: envelope as object },
    });
  }
}
