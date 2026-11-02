/**
 * Message contracts for the events queue. The API writes these to the outbox table in the same
 * transaction as the business change; the worker publishes them to SQS and handles them.
 * Consumers must tolerate duplicates: every message carries a stable messageId.
 */
export interface EventEnvelope<T extends EventType = EventType> {
  messageId: string;
  type: T;
  version: 1;
  occurredAt: string;
  payload: EventPayloads[T];
}

export interface EventPayloads {
  'identity.email_verification_requested': { userId: string; email: string; fullName: string; code: string };
  'identity.password_reset_requested': { userId: string; email: string; fullName: string; resetUrl: string };
  'identity.password_changed': { userId: string; email: string; fullName: string };
  'identity.seller_applied': { userId: string; email: string; fullName: string; shopName: string };
}

export type EventType = keyof EventPayloads;

export const EVENT_TYPES = [
  'identity.email_verification_requested',
  'identity.password_reset_requested',
  'identity.password_changed',
  'identity.seller_applied',
] as const satisfies readonly EventType[];
