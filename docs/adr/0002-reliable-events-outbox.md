# 2. Reliable events: transactional outbox and idempotent consumers

Date: 2026-11-02 · Status: accepted

## Problem

The spec asks what happens when a database transaction commits but the app dies before publishing the matching message. Publishing to SQS inside the request either loses the message (crash after commit) or sends one for a change that rolled back.

## Decision

1. **Outbox.** The API writes each event to `outbox_events` in the same transaction as the business change. Commit means the event exists; rollback means it never did.
2. **Relay.** The worker reads unsent rows with `FOR UPDATE SKIP LOCKED` (safe with several replicas), sends them to SQS in batches, and sets `published_at` only after SQS accepts them. A crash in between resends the row next pass.
3. **At-least-once, deduplicated.** Every message carries a stable `messageId`. Each handler inserts `(message_id, handler)` into `processed_messages` in the transaction that wraps its effect; a duplicate finds the row and is skipped.
4. **Retries and DLQ.** A handler that throws leaves the message on the queue; SQS redelivers after the visibility timeout. After 5 receives the queue’s redrive policy moves it to `<queue>-dlq`, where it can be inspected and replayed. Unreadable (“poison”) messages take the same path instead of being retried forever.

## Consequences

- Emails are sent after the transaction that records them, so a crash between sending and committing can repeat an email. Accepted for notifications; effects that must never repeat (payments, stock) will use database-only effects keyed by `messageId`.
- Covered by `apps/worker/test/worker.e2e-spec.ts`: publish once, duplicate delivery sends one email, failure is retried, poison message lands in the DLQ.
