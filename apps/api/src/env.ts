import { commonEnv, parseEnv } from '@schoolmate/shared';
import { z } from 'zod';

export const env = parseEnv({
  ...commonEnv,
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  /** RLS-enforced application connection (schoolmate_app role). */
  DATABASE_APP_URL: z
    .string()
    .default('postgres://schoolmate_app:schoolmate_app_dev@localhost:5433/schoolmate'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  /** Base domain for subdomain → tenant resolution (springfield.<BASE_DOMAIN>). */
  BASE_DOMAIN: z.string().default('localhost'),
  /** Seconds a slug → tenant lookup stays cached in Redis. */
  TENANT_CACHE_TTL: z.coerce.number().default(3600),
});
