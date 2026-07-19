import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

/**
 * P0-API-06: Redis-backed global limit (Plan §7: 100 req/min per user).
 * Keyed by user once auth lands (P0-AUTH); tenant+IP until then.
 */
export const rateLimitPlugin = fp(async (app: FastifyInstance) => {
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    redis: app.redis,
    nameSpace: 'rl:',
    keyGenerator: (request) => {
      const tenant = request.tenant?.slug ?? 'public';
      return `${tenant}:${request.ip}`;
    },
  });
});
