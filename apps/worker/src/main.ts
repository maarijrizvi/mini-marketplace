import { createServer } from 'node:http';
import { SQSClient } from '@aws-sdk/client-sqs';
import nodemailer from 'nodemailer';
import pg from 'pg';
import { loadConfig } from './config.js';
import { consumeOnce } from './consumer.js';
import { errorText, log } from './log.js';
import { relayOnce } from './relay.js';

// Local runs read the repo-root .env; containers get real environment variables.
if (process.env.NODE_ENV !== 'production') {
  try {
    process.loadEnvFile(new URL('../../../.env', import.meta.url));
  } catch {
    /* no .env file */
  }
}

const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 5 });
const sqs = new SQSClient({ region: config.AWS_REGION, endpoint: config.SQS_ENDPOINT });
const mailer = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
});
const sendEmail = async (email: { to: string; subject: string; text: string }) => {
  await mailer.sendMail({ from: config.MAIL_FROM, ...email });
};

let stopping = false;
let lastLoop = Date.now();

async function relayLoop() {
  while (!stopping) {
    const sent = await relayOnce(pool, sqs, config.EVENTS_QUEUE_URL);
    lastLoop = Date.now();
    if (sent === 0) await new Promise((r) => setTimeout(r, config.RELAY_INTERVAL_MS));
  }
}

async function consumeLoop() {
  while (!stopping) {
    try {
      await consumeOnce(pool, sqs, config.EVENTS_QUEUE_URL, sendEmail, 10);
    } catch (e) {
      log('error', 'receive failed', { error: errorText(e) });
      await new Promise((r) => setTimeout(r, 2000));
    }
    lastLoop = Date.now();
  }
}

// Kubernetes liveness probe: unhealthy if the loops stop turning for a minute.
const health = createServer((_req, res) => {
  const ok = Date.now() - lastLoop < 60_000;
  res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' }).end(JSON.stringify({ status: ok ? 'ok' : 'stalled' }));
});
health.listen(config.WORKER_HEALTH_PORT);

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log('info', 'shutting down', { signal });
  health.close();
  // Let in-flight work finish; the receive call returns within its wait time.
  setTimeout(async () => {
    await pool.end();
    process.exit(0);
  }, 11_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

log('info', 'worker started', { queue: config.EVENTS_QUEUE_URL });
await Promise.all([relayLoop(), consumeLoop()]);
