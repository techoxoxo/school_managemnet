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
import { authPlugin } from './plugins/auth.js';
import { dbPlugin } from './plugins/db.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { rateLimitPlugin } from './plugins/rate-limit.js';
import { redisPlugin } from './plugins/redis.js';
import { swaggerPlugin } from './plugins/swagger.js';
import { tenantPlugin } from './plugins/tenant.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { academicSessionRoutes } from './routes/v1/academic-sessions.js';
import { admissionRoutes } from './routes/v1/admissions.js';
import { branchRoutes } from './routes/v1/branches.js';
import { attendanceRoutes } from './routes/v1/attendance.js';
import { classRoutes } from './routes/v1/classes.js';
import { curriculumRoutes } from './routes/v1/curriculum.js';
import { dashboardRoutes } from './routes/v1/dashboard.js';
import { importRoutes } from './routes/v1/imports.js';
import { parentRoutes } from './routes/v1/parents.js';
import { platformRoutes } from './routes/v1/platform.js';
import { sectionRoutes } from './routes/v1/sections.js';
import { staffRoutes } from './routes/v1/staff.js';
import { staffAttendanceRoutes } from './routes/v1/staff-attendance.js';
import { studentDocumentRoutes } from './routes/v1/student-documents.js';
import { studentRoutes } from './routes/v1/students.js';
import { subjectRoutes } from './routes/v1/subjects.js';
import { tenantConfigRoutes } from './routes/v1/tenant-config.js';

export interface RouteRegistryEntry {
  method: string;
  url: string;
  permission: string | boolean | undefined;
  tenant: boolean | undefined;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Every registered route's auth declaration — feeds the permission-matrix test. */
    routeRegistry: RouteRegistryEntry[];
  }
}

/**
 * P0-API-01: one plugin per concern, explicit registration order (Plan §2).
 * errors → infra (redis, db) → docs → tenancy → rate limit → routes.
 */
export async function buildApp() {
  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : { level: env.LOG_LEVEL },
    genReqId: () => randomUUID(),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate('routeRegistry', [] as RouteRegistryEntry[]);
  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      if (method === 'HEAD' || method === 'OPTIONS') continue;
      app.routeRegistry.push({
        method,
        url: route.url,
        permission: route.config?.permission,
        tenant: route.config?.tenant,
      });
    }
  });

  await app.register(helmet);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(errorHandlerPlugin);
  await app.register(redisPlugin);
  await app.register(dbPlugin);
  await app.register(swaggerPlugin);
  await app.register(tenantPlugin);
  await app.register(rateLimitPlugin);
  await app.register(authPlugin);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(branchRoutes, { prefix: '/v1' });
  await app.register(academicSessionRoutes, { prefix: '/v1' });
  await app.register(classRoutes, { prefix: '/v1' });
  await app.register(sectionRoutes, { prefix: '/v1' });
  await app.register(subjectRoutes, { prefix: '/v1' });
  await app.register(curriculumRoutes, { prefix: '/v1' });
  await app.register(studentRoutes, { prefix: '/v1' });
  await app.register(studentDocumentRoutes, { prefix: '/v1' });
  await app.register(admissionRoutes, { prefix: '/v1' });
  await app.register(parentRoutes, { prefix: '/v1' });
  await app.register(staffRoutes, { prefix: '/v1' });
  await app.register(staffAttendanceRoutes, { prefix: '/v1' });
  await app.register(attendanceRoutes, { prefix: '/v1' });
  await app.register(dashboardRoutes, { prefix: '/v1' });
  await app.register(tenantConfigRoutes, { prefix: '/v1' });
  await app.register(importRoutes, { prefix: '/v1' });
  await app.register(platformRoutes);

  return app;
}
