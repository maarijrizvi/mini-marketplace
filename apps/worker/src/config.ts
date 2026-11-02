import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  AWS_REGION: z.string().default('eu-west-1'),
  /** Set for LocalStack; unset on AWS. */
  SQS_ENDPOINT: z.string().optional(),
  EVENTS_QUEUE_URL: z.string().min(1),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('Mini Marketplace <no-reply@mini-marketplace.local>'),
  WORKER_HEALTH_PORT: z.coerce.number().int().default(4100),
  RELAY_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
});

export type WorkerConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return parsed.data;
}
