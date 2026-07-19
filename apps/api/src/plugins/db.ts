import { createPool, withTenant, type TenantDb } from '@schoolmate/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type pg from 'pg';
import { env } from '../env.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** RLS-enforced pool (schoolmate_app role). Never superuser. */
    pgApp: pg.Pool;
  }
  interface FastifyRequest {
    /**
     * P0-API-04: run queries scoped to the request's resolved tenant.
     * Everything inside runs in one transaction with app.tenant_id set,
     * so RLS hard-limits visibility to the tenant — even without WHERE clauses.
     */
    tenantDb<T>(fn: (db: TenantDb) => Promise<T>): Promise<T>;
  }
}

export const dbPlugin = fp(async (app: FastifyInstance) => {
  const pool = createPool(env.DATABASE_APP_URL);
  app.decorate('pgApp', pool);

  app.decorateRequest('tenantDb', function tenantDb<
    T,
  >(this: FastifyRequest, fn: (db: TenantDb) => Promise<T>) {
    const tenant = this.tenant;
    if (!tenant) {
      throw new Error('tenantDb called on a request without a resolved tenant');
    }
    return withTenant(pool, tenant.id, fn);
  });

  app.addHook('onClose', async () => {
    await pool.end().catch(() => undefined);
  });
});
