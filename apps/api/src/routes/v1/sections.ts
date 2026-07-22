import { sections } from '@schoolmate/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { registerCrud } from '../../lib/crud.js';

const createSchema = z.object({
  branchId: z.string().uuid(),
  classId: z.string().uuid(),
  name: z.string().min(1).max(20), // "A", "B"
  capacity: z.number().int().min(1).max(500).optional(),
  classTeacherId: z.string().uuid().optional(),
});

export async function sectionRoutes(app: FastifyInstance) {
  registerCrud(app, {
    path: 'sections',
    entity: 'Section',
    auditType: 'section',
    permissionPrefix: 'class',
    tags: ['sections'],
    table: sections,
    idColumn: sections.id,
    orderColumn: sections.name,
    searchColumn: sections.name,
    hasUpdatedAt: true,
    createSchema,
    updateSchema: createSchema.partial().extend({ isActive: z.boolean().optional() }),
    listFilters: z.object({
      classId: z.string().uuid().optional(),
      branchId: z.string().uuid().optional(),
    }),
    buildListWhere: (q) => [
      q.classId ? eq(sections.classId, q.classId as string) : undefined,
      q.branchId ? eq(sections.branchId, q.branchId as string) : undefined,
    ],
  });
}
