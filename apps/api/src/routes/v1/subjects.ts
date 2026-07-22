import { subjects } from '@schoolmate/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { registerCrud } from '../../lib/crud.js';

const subjectType = z.enum(['core', 'elective', 'language', 'vocational', 'co_curricular', 'lab']);

const createSchema = z.object({
  branchId: z.string().uuid(),
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(30),
  subjectType: subjectType.optional(),
});

export async function subjectRoutes(app: FastifyInstance) {
  registerCrud(app, {
    path: 'subjects',
    entity: 'Subject',
    auditType: 'subject',
    permissionPrefix: 'subject',
    tags: ['subjects'],
    table: subjects,
    idColumn: subjects.id,
    orderColumn: subjects.name,
    searchColumn: subjects.name,
    hasUpdatedAt: true,
    createSchema,
    updateSchema: createSchema.partial().extend({ isActive: z.boolean().optional() }),
    listFilters: z.object({ branchId: z.string().uuid().optional() }),
    buildListWhere: (q) => (q.branchId ? [eq(subjects.branchId, q.branchId as string)] : []),
  });
}
