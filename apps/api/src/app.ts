import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { env } from './env.js';
import { dbPlugin } from './plugins/db.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { rateLimitPlugin } from './plugins/rate-limit.js';
import { redisPlugin } from './plugins/redis.js';
import { swaggerPlugin } from './plugins/swagger.js';
import { tenantPlugin } from './plugins/tenant.js';
import { healthRoutes } from './routes/health.js';
import { branchRoutes } from './routes/v1/branches.js';

/**
 * P0-API-01: one plugin per concern, explicit registration order (Plan §2).
 * errors → infra (redis, db) → docs → tenancy → rate limit → routes.
 */
export async function buildApp() {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
    genReqId: () => randomUUID(),
    disableRequestLogging: env.NODE_ENV === 'test',
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(errorHandlerPlugin);
  await app.register(redisPlugin);
  await app.register(dbPlugin);
  await app.register(swaggerPlugin);
  await app.register(tenantPlugin);
  await app.register(rateLimitPlugin);

  await app.register(healthRoutes);
  await app.register(branchRoutes, { prefix: '/v1' });

  return app;
}
