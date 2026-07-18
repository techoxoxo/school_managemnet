import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseEnv } from './env.js';

describe('parseEnv', () => {
  it('parses valid env', () => {
    const env = parseEnv({ PORT: z.coerce.number() }, { PORT: '4000' } as NodeJS.ProcessEnv);
    expect(env.PORT).toBe(4000);
  });

  it('throws with readable message on invalid env', () => {
    expect(() =>
      parseEnv({ DATABASE_URL: z.string().url() }, { DATABASE_URL: 'nope' } as NodeJS.ProcessEnv),
    ).toThrow(/DATABASE_URL/);
  });
});
