import { academicSessions } from '@schoolmate/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { registerCrud } from '../../lib/crud.js';

const createSchema = z.object({
  branchId: z.string().uuid(),
  name: z.string().min(1).max(50), // "2026-2027"
  startDate: z.string().date(),
  endDate: z.string().date(),
  isCurrent: z.boolean().optional(),
});

export async function academicSessionRoutes(app: FastifyInstance) {
  registerCrud(app, {
    path: 'academic-sessions',
    entity: 'Academic session',
    auditType: 'academic_session',
    permissionPrefix: 'session',
    tags: ['academic-sessions'],
    table: academicSessions,
    idColumn: academicSessions.id,
    orderColumn: academicSessions.startDate,
    searchColumn: academicSessions.name,
    hasUpdatedAt: false,
    createSchema,
    updateSchema: createSchema.partial().extend({ isLocked: z.boolean().optional() }),
    listFilters: z.object({ branchId: z.string().uuid().optional() }),
    buildListWhere: (q) =>
      q.branchId ? [eq(academicSessions.branchId, q.branchId as string)] : [],
  });
}
