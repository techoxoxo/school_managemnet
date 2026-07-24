/**
 * P1-MOD-03: a tenant reads its own effective config (terminology pack,
 * enabled modules, feature flags) so the tenant app can adapt its UI.
 */
import { createDb, tenants } from '@schoolmate/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export async function tenantConfigRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const db = createDb(app.pgApp);

  r.get(
    '/config',
    { config: { permission: true }, schema: { tags: ['config'] } },
    async (request) => {
      const [row] = await db
        .select({
          name: tenants.name,
          instituteType: tenants.instituteType,
          config: tenants.config,
        })
        .from(tenants)
        .where(eq(tenants.id, request.tenant!.id))
        .limit(1);
      const config = (row?.config ?? {}) as Record<string, unknown>;
      return {
        success: true as const,
        data: {
          name: row?.name ?? null,
          instituteType: row?.instituteType ?? null,
          modules: config.modules ?? [],
          terminology: config.terminology ?? {},
          featureFlags: config.featureFlags ?? {},
        },
      };
    },
  );
}
