import { and, asc, count, eq, ilike, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { z } from 'zod';
import { writeAudit } from './audit.js';
import { assertFound, idParamSchema, listQuerySchema, paginationMeta } from './http.js';

/**
 * Registers the standard 5 CRUD routes for a tenant-scoped resource:
 * GET list (paginated + search), POST create, GET :id, PATCH :id, DELETE :id.
 *
 * Every write runs inside request.tenantDb (RLS-scoped) and records an audit
 * row atomically. tenant_id is injected server-side so RLS WITH CHECK passes.
 *
 * Drizzle's generic-table variance is smoothed with a localized `AnyDb` cast;
 * the HTTP boundary stays fully typed by the Zod create/update schemas, and
 * behaviour is covered by per-resource integration tests.
 */
export interface CrudOptions<TCreate extends z.ZodTypeAny, TUpdate extends z.ZodTypeAny> {
  path: string; // URL segment, e.g. 'classes'
  entity: string; // human label for 404s, e.g. 'Class'
  auditType: string; // audit entity_type, e.g. 'class'
  permissionPrefix: string; // 'class' → class.view / class.manage
  tags: string[];
  table: PgTable;
  idColumn: PgColumn;
  orderColumn: PgColumn;
  searchColumn: PgColumn;
  hasUpdatedAt: boolean;
  createSchema: TCreate;
  updateSchema: TUpdate;
  /** Extra querystring fields (e.g. { branchId }) merged into the list query. */
  listFilters?: z.ZodObject<z.ZodRawShape>;
  /** Build additional WHERE clauses from the parsed querystring. */
  buildListWhere?: (query: Record<string, unknown>) => Array<SQL | undefined>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

function combineAnd(filters: Array<SQL | undefined>): SQL | undefined {
  const present = filters.filter((f): f is SQL => f !== undefined);
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  return and(...present);
}

export function registerCrud<TCreate extends z.ZodTypeAny, TUpdate extends z.ZodTypeAny>(
  app: FastifyInstance,
  opts: CrudOptions<TCreate, TUpdate>,
) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const table = opts.table as AnyDb;
  const view = { permission: `${opts.permissionPrefix}.view` };
  const manage = { permission: `${opts.permissionPrefix}.manage` };
  const tenantId = (request: FastifyRequest) => request.tenant!.id;
  const listQuery = opts.listFilters ? listQuerySchema.merge(opts.listFilters) : listQuerySchema;

  r.get(
    `/${opts.path}`,
    { config: view, schema: { tags: opts.tags, querystring: listQuery } },
    async (request) => {
      const query = request.query as { page: number; limit: number; q?: string } & Record<
        string,
        unknown
      >;
      const { page, limit, q } = query;
      const where = combineAnd([
        q ? ilike(opts.searchColumn, `%${q}%`) : undefined,
        ...(opts.buildListWhere?.(query) ?? []),
      ]);

      const [rows, totalRow] = (await request.tenantDb((db: AnyDb) =>
        Promise.all([
          db
            .select()
            .from(table)
            .where(where)
            .orderBy(asc(opts.orderColumn))
            .limit(limit)
            .offset((page - 1) * limit),
          db.select({ n: count() }).from(table).where(where),
        ]),
      )) as [unknown[], Array<{ n: number }>];
      const total = totalRow[0]?.n ?? 0;
      return { success: true as const, data: rows, meta: paginationMeta(total, page, limit) };
    },
  );

  r.post(
    `/${opts.path}`,
    { config: manage, schema: { tags: opts.tags, body: opts.createSchema } },
    async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      const created = await request.tenantDb(async (db: AnyDb) => {
        const [row] = await db
          .insert(table)
          .values({ ...body, tenantId: tenantId(request) })
          .returning();
        await writeAudit(db, request.auth!, {
          action: 'create',
          entityType: opts.auditType,
          entityId: row.id,
          newValues: row,
        });
        return row;
      });
      return reply.status(201).send({ success: true as const, data: created });
    },
  );

  r.get(
    `/${opts.path}/:id`,
    { config: view, schema: { tags: opts.tags, params: idParamSchema } },
    async (request) => {
      const { id } = request.params as { id: string };
      const [row] = (await request.tenantDb((db: AnyDb) =>
        db.select().from(table).where(eq(opts.idColumn, id)).limit(1),
      )) as unknown[];
      assertFound(row, opts.entity);
      return { success: true as const, data: row };
    },
  );

  r.patch(
    `/${opts.path}/:id`,
    { config: manage, schema: { tags: opts.tags, params: idParamSchema, body: opts.updateSchema } },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, unknown>;
      const updated = await request.tenantDb(async (db: AnyDb) => {
        const [before] = await db.select().from(table).where(eq(opts.idColumn, id)).limit(1);
        assertFound(before, opts.entity);
        const setValues: Record<string, unknown> = { ...body };
        if (opts.hasUpdatedAt) setValues.updatedAt = new Date();
        const [row] = await db
          .update(table)
          .set(setValues)
          .where(eq(opts.idColumn, id))
          .returning();
        await writeAudit(db, request.auth!, {
          action: 'update',
          entityType: opts.auditType,
          entityId: id,
          oldValues: before,
          newValues: row,
        });
        return row;
      });
      return { success: true as const, data: updated };
    },
  );

  r.delete(
    `/${opts.path}/:id`,
    { config: manage, schema: { tags: opts.tags, params: idParamSchema } },
    async (request) => {
      const { id } = request.params as { id: string };
      await request.tenantDb(async (db: AnyDb) => {
        const [before] = await db.select().from(table).where(eq(opts.idColumn, id)).limit(1);
        assertFound(before, opts.entity);
        await db.delete(table).where(eq(opts.idColumn, id));
        await writeAudit(db, request.auth!, {
          action: 'delete',
          entityType: opts.auditType,
          entityId: id,
          oldValues: before,
        });
      });
      return { success: true as const, data: { deleted: true } };
    },
  );
}
