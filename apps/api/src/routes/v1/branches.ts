import { branches } from '@schoolmate/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { registerCrud } from '../../lib/crud.js';

const createSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(50),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional(),
  principalName: z.string().max(200).optional(),
  isMainBranch: z.boolean().optional(),
});

export async function branchRoutes(app: FastifyInstance) {
  registerCrud(app, {
    path: 'branches',
    entity: 'Branch',
    auditType: 'branch',
    permissionPrefix: 'branch',
    tags: ['branches'],
    table: branches,
    idColumn: branches.id,
    orderColumn: branches.name,
    searchColumn: branches.name,
    hasUpdatedAt: true,
    createSchema,
    updateSchema: createSchema.partial().extend({ isActive: z.boolean().optional() }),
  });
}
