import { commonEnv, parseEnv } from '@schoolmate/shared';
import { z } from 'zod';

export const env = parseEnv({
  ...commonEnv,
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
});
