import { DeleteMessageCommand, ReceiveMessageCommand, type Message, type SQSClient } from '@aws-sdk/client-sqs';
import type { Pool } from 'pg';
import { z } from 'zod';
import { EVENT_TYPES, type EventEnvelope } from '@mm/shared';
import { EMAIL_EVENTS, emailFor, type Email } from './handlers/email.js';
import { errorText, log } from './log.js';

const envelopeSchema = z.object({
  messageId: z.string().uuid(),
  type: z.enum(EVENT_TYPES),
  version: z.literal(1),
  occurredAt: z.string(),
  payload: z.record(z.string(), z.unknown()),
});

export type SendEmail = (email: Email) => Promise<void>;

/**
 * Runs one handler for one message at most once. The processed_messages row is inserted in the
 * same transaction that wraps the side effect; if the effect throws, the row rolls back and the
 * message is retried. A crash after sending but before commit can still repeat an email, which is
 * the accepted cost of at-least-once delivery for notifications.
 */
async function once(pool: Pool, messageId: string, handler: string, effect: () => Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const claimed = await client.query('INSERT INTO processed_messages (message_id, handler) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
      messageId,
      handler,
    ]);
    if (claimed.rowCount === 0) {
      await client.query('ROLLBACK');
      return 'duplicate' as const;
    }
    await effect();
    await client.query('COMMIT');
    return 'done' as const;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

/** Handles one SQS message. Throws to leave it on the queue (SQS retries, then dead-letters it). */
export async function handleMessage(pool: Pool, sendEmail: SendEmail, message: Message) {
  let event: EventEnvelope;
  try {
    event = envelopeSchema.parse(JSON.parse(message.Body ?? '')) as EventEnvelope;
  } catch (e) {
    // A poison message: retrying won't fix it. It stays put until SQS moves it to the DLQ after
    // maxReceiveCount attempts, where an admin can inspect it.
    throw new Error(`Unreadable message ${message.MessageId}: ${errorText(e)}`, { cause: e });
  }
  if (EMAIL_EVENTS.includes(event.type)) {
    const email = emailFor(event);
    if (email) {
      const result = await once(pool, event.messageId, 'email', () => sendEmail(email));
      log('info', result === 'done' ? 'email sent' : 'duplicate skipped', { messageId: event.messageId, type: event.type });
    }
  }
}

export async function consumeOnce(pool: Pool, sqs: SQSClient, queueUrl: string, sendEmail: SendEmail, waitSeconds = 20) {
  const { Messages = [] } = await sqs.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: waitSeconds,
      MessageSystemAttributeNames: ['ApproximateReceiveCount'],
    }),
  );
  for (const message of Messages) {
    try {
      await handleMessage(pool, sendEmail, message);
      await sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }));
    } catch (e) {
      log('error', 'message failed; SQS will retry it', {
        messageId: message.MessageId,
        receiveCount: message.Attributes?.ApproximateReceiveCount,
        error: errorText(e),
      });
    }
  }
  return Messages.length;
}
