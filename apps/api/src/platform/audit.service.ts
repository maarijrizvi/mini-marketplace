import { Injectable } from '@nestjs/common';
import type { Tx } from './prisma.service.js';

export type Actor = { type: 'user'; id: string } | { type: 'system'; id: string };

/** Appends to the audit log inside the caller's transaction, so the record and the change commit together. */
@Injectable()
export class AuditService {
  async record(
    tx: Tx,
    actor: Actor,
    action: string,
    entity: { type: string; id: string },
    change: { before?: object | null; after?: object | null } = {},
  ) {
    await tx.auditLog.create({
      data: {
        actorType: actor.type,
        actorId: actor.id,
        action,
        entityType: entity.type,
        entityId: entity.id,
        before: change.before ?? undefined,
        after: change.after ?? undefined,
      },
    });
  }
}
