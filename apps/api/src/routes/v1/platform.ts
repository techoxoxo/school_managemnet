/**
 * P1-MOD-01: platform (super-admin) API. These routes are NOT tenant-scoped
 * (config.tenant:false) and operate on the platform-level `tenants` registry.
 * Both tenant_admin and super_admin carry '*' permissions, so a permission
 * string can't distinguish them — every route here additionally requires the
 * session ROLE to be super_admin.
 */
import { createDb, tenants } from '@schoolmate/db';
import { AppError, ErrorCodes, INSTITUTE_PRESETS } from '@schoolmate/shared';
import { asc, count, eq, ilike } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { assertFound, idParamSchema, listQuerySchema, paginationMeta } from '../../lib/http.js';

const instituteType = z.enum([
  'playschool',
  'kindergarten',
  'school',
  'k12_multi_branch',
  'coaching_center',
  'college',
]);

export async function platformRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const db = createDb(app.pgApp);
  // Skip tenant resolution; the global auth guard still authenticates.
  const cfg = { tenant: false as const, permission: true as const };

  // Gate the whole plugin on the super_admin role (runs after the global guard).
  app.addHook('preHandler', async (request) => {
    if (request.auth && request.auth.role !== 'super_admin') {
      throw new AppError(ErrorCodes.PERMISSION_DENIED, 'Super-admin access required', 403);
    }
  });

  r.get(
    '/platform/tenants',
    { config: cfg, schema: { tags: ['platform'], querystring: listQuerySchema } },
    async (request) => {
      const { page, limit, q } = request.query;
      const where = q ? ilike(tenants.name, `%${q}%`) : undefined;
      const [rows, [total]] = await Promise.all([
        db
          .select()
          .from(tenants)
          .where(where)
          .orderBy(asc(tenants.name))
          .limit(limit)
          .offset((page - 1) * limit),
        db.select({ n: count() }).from(tenants).where(where),
      ]);
      return {
        success: true as const,
        data: rows,
        meta: paginationMeta(total?.n ?? 0, page, limit),
      };
    },
  );

  r.post(
    '/platform/tenants',
    {
      config: cfg,
      schema: {
        tags: ['platform'],
        body: z.object({
          name: z.string().min(1).max(160),
          slug: z
            .string()
            .min(2)
            .max(40)
            .regex(/^[a-z0-9-]+$/, 'lowercase letters, numbers, and hyphens only'),
          instituteType: instituteType.optional(),
          subscriptionStatus: z.enum(['trial', 'active']).optional(),
          maxBranches: z.number().int().min(1).max(1000).optional(),
          maxStudents: z.number().int().min(1).optional(),
        }),
      },
    },
    async (request, reply) => {
      const preset = INSTITUTE_PRESETS[request.body.instituteType ?? 'school'];
      const [row] = await db
        .insert(tenants)
        .values({
          ...request.body,
          config: { modules: preset.modules, terminology: preset.terminology, featureFlags: {} },
        })
        .returning();
      return reply.status(201).send({ success: true as const, data: row });
    },
  );

  r.get(
    '/platform/tenants/:id',
    { config: cfg, schema: { tags: ['platform'], params: idParamSchema } },
    async (request) => {
      const [row] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, request.params.id))
        .limit(1);
      assertFound(row, 'Tenant');
      return { success: true as const, data: row };
    },
  );
}
