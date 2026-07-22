import { commonEnv, parseEnv } from '@schoolmate/shared';
import { z } from 'zod';

export const env = parseEnv({
  ...commonEnv,
  /** Admin (BYPASSRLS) connection — the relay processes every tenant's outbox. */
  DATABASE_URL: z
    .string()
    .default('postgres://schoolmate:schoolmate_dev@localhost:5433/schoolmate'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  MAIL_FROM: z.string().default('no-reply@schoolmate.app'),
  /** Poll cadence for the outbox relay + queue processor. */
  RELAY_INTERVAL_MS: z.coerce.number().default(2000),
  RELAY_BATCH_SIZE: z.coerce.number().default(100),
  MAX_DELIVERY_ATTEMPTS: z.coerce.number().default(5),
});
