import type { FastifyInstance } from 'fastify';

/** P0-API-07: liveness + readiness. Public — no tenant context. */
export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', { config: { tenant: false } }, async () => ({
    status: 'ok',
    uptime: process.uptime(),
  }));

  app.get('/ready', { config: { tenant: false } }, async (_request, reply) => {
    const checks: Record<string, 'ok' | 'fail'> = { database: 'fail', redis: 'fail' };

    await Promise.all([
      app.pgApp
        .query('SELECT 1')
        .then(() => (checks.database = 'ok'))
        .catch(() => undefined),
      app.redis
        .ping()
        .then(() => (checks.redis = 'ok'))
        .catch(() => undefined),
    ]);

    const ready = Object.values(checks).every((c) => c === 'ok');
    return reply.status(ready ? 200 : 503).send({ status: ready ? 'ready' : 'not_ready', checks });
  });
}
