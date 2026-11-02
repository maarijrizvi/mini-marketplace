import { SendMessageBatchCommand, type SQSClient } from '@aws-sdk/client-sqs';
import type { Pool } from 'pg';
import { errorText, log } from './log.js';

const BATCH = 10; // SQS batch limit

/**
 * Moves committed outbox rows to SQS. Rows are locked with SKIP LOCKED, so several worker
 * replicas can run without sending the same row twice at the same moment. A row is marked
 * published only after SQS accepts it; if the worker dies in between, it is sent again on the
 * next pass, and consumers skip the duplicate by messageId.
 * Returns how many rows were published.
 */
export async function relayOnce(pool: Pool, sqs: SQSClient, queueUrl: string): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ id: string; payload: unknown }>(
      `SELECT id, payload FROM outbox_events
        WHERE published_at IS NULL
        ORDER BY created_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [BATCH],
    );
    if (rows.length === 0) {
      await client.query('COMMIT');
      return 0;
    }
    const result = await sqs.send(
      new SendMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: rows.map((r) => ({ Id: r.id, MessageBody: JSON.stringify(r.payload) })),
      }),
    );
    const sent = (result.Successful ?? []).map((s) => s.Id!);
    if (sent.length) await client.query('UPDATE outbox_events SET published_at = now() WHERE id = ANY($1::uuid[])', [sent]);
    for (const failed of result.Failed ?? []) {
      await client.query('UPDATE outbox_events SET attempts = attempts + 1, last_error = $2 WHERE id = $1', [
        failed.Id,
        failed.Message ?? failed.Code,
      ]);
      log('warn', 'outbox row not accepted by SQS', { outboxId: failed.Id, code: failed.Code });
    }
    await client.query('COMMIT');
    return sent.length;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    log('error', 'outbox relay failed', { error: errorText(e) });
    return 0;
  } finally {
    client.release();
  }
}
