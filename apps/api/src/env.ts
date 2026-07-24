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
  /** Meilisearch (P1-MOD-17). Search degrades gracefully when unreachable. */
  MEILI_HOST: z.string().default('http://127.0.0.1:7700'),
  MEILI_MASTER_KEY: z.string().default('schoolmate_dev_master_key'),
  /** Base domain for subdomain → tenant resolution (springfield.<BASE_DOMAIN>). */
  BASE_DOMAIN: z.string().default('localhost'),
  /** Seconds a slug → tenant lookup stays cached in Redis. */
  TENANT_CACHE_TTL: z.coerce.number().default(3600),
  /** Auth (Plan §5). Set a real secret outside dev — boot fails in production without one. */
  JWT_SECRET: z.string().default('dev_only_change_me'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().default(900), // 15 min
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().default(7 * 24 * 3600), // 7 days
  LOCKOUT_MAX_ATTEMPTS: z.coerce.number().default(5),
  LOCKOUT_MINUTES: z.coerce.number().default(30),
  PASSWORD_RESET_TTL_SECONDS: z.coerce.number().default(1800), // 30 min
  /** 32-byte base64 master key for field-level encryption (Plan §13). */
  FIELD_ENCRYPTION_KEY: z.string().default('ZGV2LW9ubHktMzItYnl0ZS1maWVsZC1lbmMta2V5ISE='),
});

if (env.NODE_ENV === 'production') {
  if (env.JWT_SECRET === 'dev_only_change_me') {
    throw new Error('JWT_SECRET must be set in production');
  }
  if (env.FIELD_ENCRYPTION_KEY.startsWith('ZGV2LW9ubHkt')) {
    throw new Error('FIELD_ENCRYPTION_KEY must be set in production');
  }
}
