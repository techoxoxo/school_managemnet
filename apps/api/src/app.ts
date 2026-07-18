import Fastify from 'fastify';
import { env } from './env.js';

/**
 * Builds the Fastify instance. Plugins (tenancy, auth, db, rate limiting)
 * register here as Phase 0 progresses — one plugin per concern (Plan §2).
 */
export function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });

  app.get('/health', async () => ({ status: 'ok', uptime: process.uptime() }));

  return app;
}
