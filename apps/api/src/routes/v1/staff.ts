import { departments, staffMembers } from '@schoolmate/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { registerCrud } from '../../lib/crud.js';

const staffCreate = z.object({
  branchId: z.string().uuid(),
  employeeId: z.string().min(1).max(50),
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional(),
  designation: z.string().max(120).optional(),
  departmentId: z.string().uuid().optional(),
  employmentType: z.enum(['permanent', 'contract', 'part_time', 'visiting']).optional(),
  qualification: z.string().max(200).optional(),
  dateOfJoining: z.string().date().optional(),
  baseSalary: z.number().int().min(0).optional(),
});

const deptCreate = z.object({
  branchId: z.string().uuid(),
  name: z.string().min(1).max(120),
  hodStaffId: z.string().uuid().optional(),
});

export async function staffRoutes(app: FastifyInstance) {
  registerCrud(app, {
    path: 'staff',
    entity: 'Staff member',
    auditType: 'staff',
    permissionPrefix: 'staff',
    tags: ['staff'],
    table: staffMembers,
    idColumn: staffMembers.id,
    orderColumn: staffMembers.firstName,
    searchColumn: staffMembers.firstName,
    hasUpdatedAt: true,
    createSchema: staffCreate,
    updateSchema: staffCreate.partial().extend({
      status: z.enum(['active', 'on_leave', 'resigned', 'terminated', 'retired']).optional(),
      dateOfLeaving: z.string().date().optional(),
      leavingReason: z.string().max(300).optional(),
    }),
    listFilters: z.object({
      branchId: z.string().uuid().optional(),
      departmentId: z.string().uuid().optional(),
    }),
    buildListWhere: (q) => [
      q.branchId ? eq(staffMembers.branchId, q.branchId as string) : undefined,
      q.departmentId ? eq(staffMembers.departmentId, q.departmentId as string) : undefined,
    ],
  });

  registerCrud(app, {
    path: 'departments',
    entity: 'Department',
    auditType: 'department',
    permissionPrefix: 'staff',
    tags: ['departments'],
    table: departments,
    idColumn: departments.id,
    orderColumn: departments.name,
    searchColumn: departments.name,
    hasUpdatedAt: true,
    createSchema: deptCreate,
    updateSchema: deptCreate.partial(),
    listFilters: z.object({ branchId: z.string().uuid().optional() }),
    buildListWhere: (q) => (q.branchId ? [eq(departments.branchId, q.branchId as string)] : []),
  });
}
