import { randomUUID } from 'node:crypto';
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  PurgeQueueCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import nodemailer from 'nodemailer';
import pg from 'pg';
import { consumeOnce } from '../src/consumer.js';
import { relayOnce } from '../src/relay.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const sqs = new SQSClient({ region: process.env.AWS_REGION, endpoint: process.env.SQS_ENDPOINT });
const mailpit = 'http://localhost:8025/api/v1';
const mailer = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) });
const sendEmail = async (e: { to: string; subject: string; text: string }) => {
  await mailer.sendMail({ from: 'test@mini-marketplace.local', ...e });
};

let queueUrl: string;
let dlqUrl: string;

async function inbox(): Promise<{ Subject: string }[]> {
  const res = await fetch(`${mailpit}/messages`);
  return ((await res.json()) as { messages: { Subject: string }[] }).messages;
}

function verificationEvent(email: string, code: string) {
  const messageId = randomUUID();
  return {
    messageId,
    type: 'identity.email_verification_requested',
    version: 1,
    occurredAt: new Date().toISOString(),
    payload: { userId: randomUUID(), email, fullName: 'Test User', code },
  };
}

beforeAll(async () => {
  // A private queue pair per run: short visibility timeout and maxReceiveCount 2 keep the DLQ test fast.
  const name = `mm-test-${Date.now()}`;
  dlqUrl = (await sqs.send(new CreateQueueCommand({ QueueName: `${name}-dlq` }))).QueueUrl!;
  const dlqArn = (await sqs.send(new GetQueueAttributesCommand({ QueueUrl: dlqUrl, AttributeNames: ['QueueArn'] }))).Attributes!.QueueArn;
  queueUrl = (
    await sqs.send(
      new CreateQueueCommand({
        QueueName: name,
        Attributes: { VisibilityTimeout: '1', RedrivePolicy: JSON.stringify({ deadLetterTargetArn: dlqArn, maxReceiveCount: '2' }) },
      }),
    )
  ).QueueUrl!;
});

beforeEach(async () => {
  await pool.query('TRUNCATE outbox_events, processed_messages');
  await fetch(`${mailpit}/messages`, { method: 'DELETE' });
  await sqs.send(new PurgeQueueCommand({ QueueUrl: queueUrl })).catch(() => undefined);
});

afterAll(async () => {
  await sqs.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
  await sqs.send(new DeleteQueueCommand({ QueueUrl: dlqUrl }));
  await pool.end();
});

it('publishes committed outbox rows and emails each one exactly once', async () => {
  const event = verificationEvent('first@example.com', '123456');
  await pool.query(`INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload) VALUES ($1, 'user', $2, $3, $4)`, [
    event.messageId,
    event.payload.userId,
    event.type,
    JSON.stringify(event),
  ]);

  expect(await relayOnce(pool, sqs, queueUrl)).toBe(1);
  expect(await relayOnce(pool, sqs, queueUrl)).toBe(0); // already published

  // The same message delivered twice (as SQS may do) sends one email.
  await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(event) }));
  let handled = 0;
  for (let i = 0; i < 5 && handled < 2; i++) handled += await consumeOnce(pool, sqs, queueUrl, sendEmail, 1);
  expect(handled).toBe(2);

  const subjects = (await inbox()).map((m) => m.Subject);
  expect(subjects).toEqual(['123456 is your Mini Marketplace code']);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM processed_messages WHERE message_id = $1', [event.messageId]);
  expect(rows[0].n).toBe(1);
});

it('leaves a failing email on the queue to retry', async () => {
  const event = verificationEvent('retry@example.com', '654321');
  await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(event) }));
  await consumeOnce(
    pool,
    sqs,
    queueUrl,
    async () => {
      throw new Error('SMTP down');
    },
    1,
  );
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM processed_messages');
  expect(rows[0].n).toBe(0); // rolled back, so the retry will send it

  await new Promise((r) => setTimeout(r, 1500)); // visibility timeout
  await consumeOnce(pool, sqs, queueUrl, sendEmail, 2);
  expect((await inbox()).map((m) => m.Subject)).toEqual(['654321 is your Mini Marketplace code']);
});

it('moves a poison message to the dead-letter queue after repeated failures', async () => {
  await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: '{not json' }));
  for (let i = 0; i < 3; i++) {
    await consumeOnce(pool, sqs, queueUrl, sendEmail, 1);
    await new Promise((r) => setTimeout(r, 1200));
  }
  const dead = await sqs.send(new ReceiveMessageCommand({ QueueUrl: dlqUrl, WaitTimeSeconds: 2 }));
  expect(dead.Messages?.[0]?.Body).toBe('{not json');
});
