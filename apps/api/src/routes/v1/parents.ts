import { parents } from '@schoolmate/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { registerCrud } from '../../lib/crud.js';

const relation = z.enum(['father', 'mother', 'guardian', 'other']);

const createSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional(),
  relation: relation.optional(),
  phone: z.string().max(30).optional(),
  altPhone: z.string().max(30).optional(),
  email: z.string().email().optional(),
  occupation: z.string().max(120).optional(),
  employer: z.string().max(160).optional(),
  annualIncome: z.number().int().min(0).optional(),
});

export async function parentRoutes(app: FastifyInstance) {
  registerCrud(app, {
    path: 'parents',
    entity: 'Parent',
    auditType: 'parent',
    permissionPrefix: 'parent',
    tags: ['parents'],
    table: parents,
    idColumn: parents.id,
    orderColumn: parents.firstName,
    searchColumn: parents.firstName,
    hasUpdatedAt: true,
    createSchema,
    updateSchema: createSchema.partial(),
  });
}
