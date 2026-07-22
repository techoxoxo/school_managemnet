import { classes } from '@schoolmate/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { registerCrud } from '../../lib/crud.js';

const classType = z.enum([
  'playgroup',
  'kindergarten',
  'primary',
  'middle',
  'secondary',
  'senior_secondary',
  'undergraduate',
  'postgraduate',
  'coaching',
]);

const createSchema = z.object({
  branchId: z.string().uuid(),
  name: z.string().min(1).max(100),
  displayOrder: z.number().int().min(0).optional(),
  classType: classType.optional(),
});

export async function classRoutes(app: FastifyInstance) {
  registerCrud(app, {
    path: 'classes',
    entity: 'Class',
    auditType: 'class',
    permissionPrefix: 'class',
    tags: ['classes'],
    table: classes,
    idColumn: classes.id,
    orderColumn: classes.displayOrder,
    searchColumn: classes.name,
    hasUpdatedAt: true,
    createSchema,
    updateSchema: createSchema.partial().extend({ isActive: z.boolean().optional() }),
    listFilters: z.object({ branchId: z.string().uuid().optional() }),
    buildListWhere: (q) => (q.branchId ? [eq(classes.branchId, q.branchId as string)] : []),
  });
}
