import { departments, emitEvent, staffMembers, users, userTenantRoles } from '@schoolmate/db';
import { AppError, ErrorCodes, EVENT_TYPES } from '@schoolmate/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { writeAudit } from '../../lib/audit.js';
import { assertFound, idParamSchema } from '../../lib/http.js';
import { registerCrud } from '../../lib/crud.js';

/** Roles a tenant may assign to its staff — never the platform super_admin. */
const assignableRole = z.enum([
  'tenant_admin',
  'branch_admin',
  'teacher',
  'accountant',
  'librarian',
  'hostel_warden',
  'transport_manager',
  'receptionist',
  'counselor',
  'custom',
]);

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

  // ── Staff user account + role assignment (P1-MOD-19) ────────
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/staff/:id/account',
    {
      config: { permission: 'user.manage' },
      schema: {
        tags: ['staff'],
        params: idParamSchema,
        body: z.object({
          email: z.string().email(),
          role: assignableRole,
          branchId: z.string().uuid().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { email, role, branchId } = request.body;
      const result = await request.tenantDb(async (db) => {
        const [staff] = await db
          .select()
          .from(staffMembers)
          .where(eq(staffMembers.id, request.params.id))
          .limit(1);
        assertFound(staff, 'Staff member');
        if (staff.userId) {
          throw new AppError(ErrorCodes.CONFLICT, 'Staff member already has an account', 409);
        }

        // Reuse an existing identity by email (a person may work at several
        // tenants); otherwise create one with no password — they set it via
        // the reset/invite flow (P0-AUTH-04). users is platform-level (no RLS).
        const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        let user = existing;
        const isNewUser = !existing;
        if (!user) {
          [user] = await db.insert(users).values({ email, status: 'active' }).returning();
        }

        await db
          .update(staffMembers)
          .set({ userId: user!.id, updatedAt: new Date() })
          .where(eq(staffMembers.id, staff.id));

        const [roleRow] = await db
          .insert(userTenantRoles)
          .values({
            userId: user!.id,
            tenantId: request.tenant!.id,
            branchId: branchId ?? staff.branchId,
            role,
            isPrimaryRole: true,
          })
          .onConflictDoNothing({
            target: [userTenantRoles.userId, userTenantRoles.tenantId, userTenantRoles.role],
          })
          .returning();

        await writeAudit(db, request.auth!, {
          action: 'create',
          entityType: 'staff_account',
          entityId: staff.id,
          newValues: { staffId: staff.id, userId: user!.id, email, role },
        });
        // Recorded for the invite/set-password handler (Plan §19).
        await emitEvent(db, {
          tenantId: request.tenant!.id,
          type: EVENT_TYPES.STAFF_ACCOUNT_CREATED,
          aggregateType: 'staff',
          aggregateId: staff.id,
          payload: { staffId: staff.id, userId: user!.id, email, role, isNewUser },
        });

        return { userId: user!.id, email, role, isNewUser, roleId: roleRow?.id };
      });
      return reply.status(201).send({ success: true as const, data: result });
    },
  );

  r.get(
    '/staff/:id/roles',
    { config: { permission: 'user.view' }, schema: { tags: ['staff'], params: idParamSchema } },
    async (request) => {
      const rows = await request.tenantDb(async (db) => {
        const [staff] = await db
          .select({ userId: staffMembers.userId })
          .from(staffMembers)
          .where(eq(staffMembers.id, request.params.id))
          .limit(1);
        assertFound(staff, 'Staff member');
        if (!staff.userId) return [];
        return db
          .select({
            id: userTenantRoles.id,
            role: userTenantRoles.role,
            branchId: userTenantRoles.branchId,
            isPrimaryRole: userTenantRoles.isPrimaryRole,
            isActive: userTenantRoles.isActive,
          })
          .from(userTenantRoles)
          .where(eq(userTenantRoles.userId, staff.userId));
      });
      return { success: true as const, data: rows };
    },
  );

  r.post(
    '/staff/:id/roles',
    {
      config: { permission: 'role.manage' },
      schema: {
        tags: ['staff'],
        params: idParamSchema,
        body: z.object({ role: assignableRole, branchId: z.string().uuid().optional() }),
      },
    },
    async (request, reply) => {
      const created = await request.tenantDb(async (db) => {
        const [staff] = await db
          .select({ userId: staffMembers.userId, branchId: staffMembers.branchId })
          .from(staffMembers)
          .where(eq(staffMembers.id, request.params.id))
          .limit(1);
        assertFound(staff, 'Staff member');
        if (!staff.userId) {
          throw new AppError(ErrorCodes.CONFLICT, 'Create the account first', 409);
        }
        const [row] = await db
          .insert(userTenantRoles)
          .values({
            userId: staff.userId,
            tenantId: request.tenant!.id,
            branchId: request.body.branchId ?? staff.branchId,
            role: request.body.role,
          })
          .onConflictDoNothing({
            target: [userTenantRoles.userId, userTenantRoles.tenantId, userTenantRoles.role],
          })
          .returning();
        await writeAudit(db, request.auth!, {
          action: 'create',
          entityType: 'user_tenant_role',
          entityId: row?.id ?? request.params.id,
          newValues: { staffId: request.params.id, role: request.body.role },
        });
        return row ?? { alreadyAssigned: true };
      });
      return reply.status(201).send({ success: true as const, data: created });
    },
  );

  r.delete(
    '/staff/:id/roles/:roleId',
    {
      config: { permission: 'role.manage' },
      schema: {
        tags: ['staff'],
        params: z.object({ id: z.string().uuid(), roleId: z.string().uuid() }),
      },
    },
    async (request) => {
      await request.tenantDb(async (db) => {
        const [staff] = await db
          .select({ userId: staffMembers.userId })
          .from(staffMembers)
          .where(eq(staffMembers.id, request.params.id))
          .limit(1);
        assertFound(staff, 'Staff member');
        if (!staff.userId)
          throw new AppError(ErrorCodes.NOT_FOUND, 'Role assignment not found', 404);
        const [row] = await db
          .select()
          .from(userTenantRoles)
          .where(
            and(
              eq(userTenantRoles.id, request.params.roleId),
              eq(userTenantRoles.userId, staff.userId),
            ),
          )
          .limit(1);
        assertFound(row, 'Role assignment');
        await db.delete(userTenantRoles).where(eq(userTenantRoles.id, request.params.roleId));
        await writeAudit(db, request.auth!, {
          action: 'delete',
          entityType: 'user_tenant_role',
          entityId: request.params.roleId,
          oldValues: row,
        });
      });
      return { success: true as const, data: { deleted: true } };
    },
  );
}
