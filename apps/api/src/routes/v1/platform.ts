/**
 * P1-MOD-01: platform (super-admin) API. These routes are NOT tenant-scoped
 * (config.tenant:false) and operate on the platform-level `tenants` registry.
 * Both tenant_admin and super_admin carry '*' permissions, so a permission
 * string can't distinguish them — every route here additionally requires the
 * session ROLE to be super_admin.
 */
import { academicSessions, branches, classes, createDb, tenants, withTenant } from '@schoolmate/db';
import { AppError, ErrorCodes, INSTITUTE_PRESETS } from '@schoolmate/shared';
import { asc, count, eq, ilike } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { assertFound, idParamSchema, listQuerySchema, paginationMeta } from '../../lib/http.js';
import { invalidateTenantCache } from '../../plugins/tenant.js';

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

  // ── Config engine (P1-MOD-03): modules / terminology / flags / limits ──
  interface TenantConfig {
    modules?: string[];
    terminology?: Record<string, string>;
    featureFlags?: Record<string, boolean>;
  }

  r.patch(
    '/platform/tenants/:id/config',
    {
      config: cfg,
      schema: {
        tags: ['platform'],
        params: idParamSchema,
        body: z.object({
          instituteType: instituteType.optional(),
          subscriptionStatus: z.enum(['trial', 'active', 'past_due', 'suspended']).optional(),
          maxBranches: z.number().int().min(1).max(1000).optional(),
          maxStudents: z.number().int().min(1).optional(),
          modules: z.array(z.string()).optional(),
          terminology: z.record(z.string()).optional(),
          featureFlags: z.record(z.boolean()).optional(),
        }),
      },
    },
    async (request) => {
      const b = request.body;
      const [before] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, request.params.id))
        .limit(1);
      assertFound(before, 'Tenant');

      const cur = (before.config ?? {}) as TenantConfig;
      const nextConfig: TenantConfig = {
        modules: b.modules ?? cur.modules ?? [],
        terminology: { ...(cur.terminology ?? {}), ...(b.terminology ?? {}) },
        featureFlags: { ...(cur.featureFlags ?? {}), ...(b.featureFlags ?? {}) },
      };

      const [row] = await db
        .update(tenants)
        .set({
          ...(b.instituteType ? { instituteType: b.instituteType } : {}),
          ...(b.subscriptionStatus ? { subscriptionStatus: b.subscriptionStatus } : {}),
          ...(b.maxBranches != null ? { maxBranches: b.maxBranches } : {}),
          ...(b.maxStudents != null ? { maxStudents: b.maxStudents } : {}),
          config: nextConfig,
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, request.params.id))
        .returning();
      // Status/type/name are cached by the tenant plugin — drop the stale entry.
      await invalidateTenantCache(app, before.slug).catch(() => undefined);
      return { success: true as const, data: row };
    },
  );

  // ── Onboarding auto-scaffold (P1-MOD-02): branch + session + class ladder ──
  r.post(
    '/platform/tenants/:id/onboard',
    {
      config: cfg,
      schema: {
        tags: ['platform'],
        params: idParamSchema,
        body: z.object({
          branchName: z.string().min(1).max(120).optional(),
          branchCode: z.string().min(1).max(20).optional(),
          session: z
            .object({
              name: z.string().min(1).max(40),
              startDate: z.string().date(),
              endDate: z.string().date(),
            })
            .optional(),
        }),
      },
    },
    async (request, reply) => {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, request.params.id))
        .limit(1);
      assertFound(tenant, 'Tenant');
      if (tenant.onboardedAt) {
        throw new AppError(ErrorCodes.CONFLICT, 'Tenant already onboarded', 409);
      }
      const preset = INSTITUTE_PRESETS[tenant.instituteType as keyof typeof INSTITUTE_PRESETS];

      // Tenant-scoped inserts run under the tenant's RLS GUC.
      const result = await withTenant(app.pgApp, tenant.id, async (tdb) => {
        const [branch] = await tdb
          .insert(branches)
          .values({
            tenantId: tenant.id,
            name: request.body.branchName ?? 'Main Campus',
            code: request.body.branchCode ?? 'MAIN',
            isMainBranch: true,
          })
          .returning();

        let sessionId: string | null = null;
        if (request.body.session) {
          const [s] = await tdb
            .insert(academicSessions)
            .values({
              tenantId: tenant.id,
              branchId: branch!.id,
              name: request.body.session.name,
              startDate: request.body.session.startDate,
              endDate: request.body.session.endDate,
              isCurrent: true,
            })
            .returning();
          sessionId = s!.id;
        }

        const rows = preset.defaultClasses.map((c, i) => ({
          tenantId: tenant.id,
          branchId: branch!.id,
          name: c.name,
          classType: c.classType as (typeof classes.$inferInsert)['classType'],
          displayOrder: i,
        }));
        await tdb.insert(classes).values(rows);

        return { branchId: branch!.id, sessionId, classesCreated: rows.length };
      });

      await db
        .update(tenants)
        .set({ onboardedAt: new Date(), updatedAt: new Date() })
        .where(eq(tenants.id, tenant.id));

      return reply.status(201).send({ success: true as const, data: result });
    },
  );
}
