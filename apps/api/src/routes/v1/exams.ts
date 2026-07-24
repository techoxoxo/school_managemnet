/**
 * P2-MOD-13: grading systems. Presets (CBSE/GPA/percentage) + custom scales.
 * Exams/datesheet/marks build on this in later tasks.
 */
import { gradingSystems } from '@schoolmate/db';
import { GRADING_PRESETS } from '@schoolmate/shared';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { writeAudit } from '../../lib/audit.js';
import { assertFound, idParamSchema } from '../../lib/http.js';

const scaleSchema = z.array(
  z.object({
    grade: z.string().min(1).max(10),
    min: z.number().int().min(0).max(100),
    max: z.number().int().min(0).max(100),
    points: z.number().min(0).max(100),
  }),
);

export async function examRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const view = { permission: 'exam.view' };
  const manage = { permission: 'exam.manage' };

  r.get('/grading-systems/presets', { config: view, schema: { tags: ['exams'] } }, async () => ({
    success: true as const,
    data: Object.values(GRADING_PRESETS),
  }));

  r.get(
    '/grading-systems',
    {
      config: view,
      schema: {
        tags: ['exams'],
        querystring: z.object({ branchId: z.string().uuid().optional() }),
      },
    },
    async (request) => {
      const rows = await request.tenantDb((db) =>
        db
          .select()
          .from(gradingSystems)
          .where(
            request.query.branchId
              ? eq(gradingSystems.branchId, request.query.branchId)
              : undefined,
          )
          .orderBy(asc(gradingSystems.name)),
      );
      return { success: true as const, data: rows };
    },
  );

  r.post(
    '/grading-systems',
    {
      config: manage,
      schema: {
        tags: ['exams'],
        body: z.object({
          branchId: z.string().uuid(),
          name: z.string().min(1).max(120),
          type: z.enum(['percentage', 'gpa', 'letter']).optional(),
          scale: scaleSchema,
          isDefault: z.boolean().optional(),
        }),
      },
    },
    async (request, reply) => {
      const created = await request.tenantDb(async (db) => {
        const [row] = await db
          .insert(gradingSystems)
          .values({
            tenantId: request.tenant!.id,
            branchId: request.body.branchId,
            name: request.body.name,
            type: request.body.type ?? 'letter',
            scale: request.body.scale,
            isDefault: request.body.isDefault ?? false,
          })
          .returning();
        await writeAudit(db, request.auth!, {
          action: 'create',
          entityType: 'grading_system',
          entityId: row!.id,
          newValues: { name: row!.name, bands: request.body.scale.length },
        });
        return row!;
      });
      return reply.status(201).send({ success: true as const, data: created });
    },
  );

  r.post(
    '/grading-systems/from-preset',
    {
      config: manage,
      schema: {
        tags: ['exams'],
        body: z.object({
          branchId: z.string().uuid(),
          preset: z.enum(['cbse', 'gpa4', 'percentage']),
          name: z.string().min(1).max(120).optional(),
        }),
      },
    },
    async (request, reply) => {
      const preset = GRADING_PRESETS[request.body.preset];
      const created = await request.tenantDb(async (db) => {
        const [row] = await db
          .insert(gradingSystems)
          .values({
            tenantId: request.tenant!.id,
            branchId: request.body.branchId,
            name: request.body.name ?? preset.name,
            type: preset.type,
            scale: preset.scale,
          })
          .returning();
        await writeAudit(db, request.auth!, {
          action: 'create',
          entityType: 'grading_system',
          entityId: row!.id,
          newValues: { preset: request.body.preset, name: row!.name },
        });
        return row!;
      });
      return reply.status(201).send({ success: true as const, data: created });
    },
  );

  r.delete(
    '/grading-systems/:id',
    { config: manage, schema: { tags: ['exams'], params: idParamSchema } },
    async (request) => {
      await request.tenantDb(async (db) => {
        const [before] = await db
          .select()
          .from(gradingSystems)
          .where(eq(gradingSystems.id, request.params.id))
          .limit(1);
        assertFound(before, 'Grading system');
        await db.delete(gradingSystems).where(eq(gradingSystems.id, request.params.id));
        await writeAudit(db, request.auth!, {
          action: 'delete',
          entityType: 'grading_system',
          entityId: request.params.id,
          oldValues: { name: before.name },
        });
      });
      return { success: true as const, data: { deleted: true } };
    },
  );

  void and; // reserved for multi-column filters as exam routes land
}
