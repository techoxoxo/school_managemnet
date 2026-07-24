/**
 * P1-MOD-16: bulk import v1 (students + parents). The spreadsheet/Excel parse
 * and column mapping happen client-side; this API takes canonical rows and
 * provides dry-run validation, an all-or-nothing staged commit tagged with a
 * batch id, and rollback-by-batch. Reused by staff import (P1-MOD-21).
 */
import { importBatches, parents, parentStudent, staffMembers, students } from '@schoolmate/db';
import { count, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { writeAudit } from '../../lib/audit.js';
import { assertFound, idParamSchema } from '../../lib/http.js';

const rowSchema = z.object({
  admissionNumber: z.string().min(1).max(50),
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional(),
  rollNumber: z.string().max(30).optional(),
  dateOfBirth: z.string().date().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  currentClassId: z.string().uuid().optional(),
  currentSectionId: z.string().uuid().optional(),
  admissionDate: z.string().date().optional(),
  parentFirstName: z.string().max(100).optional(),
  parentLastName: z.string().max(100).optional(),
  parentPhone: z.string().max(30).optional(),
  parentEmail: z.string().email().optional(),
  parentRelation: z.enum(['father', 'mother', 'guardian', 'other']).optional(),
});
type ImportRow = z.infer<typeof rowSchema>;

/** The columns the client maps a spreadsheet onto (P1-MOD-16 template). */
const TEMPLATE = [
  { field: 'admissionNumber', label: 'Admission Number', required: true },
  { field: 'firstName', label: 'First Name', required: true },
  { field: 'lastName', label: 'Last Name', required: false },
  { field: 'rollNumber', label: 'Roll Number', required: false },
  { field: 'dateOfBirth', label: 'Date of Birth (YYYY-MM-DD)', required: false },
  { field: 'gender', label: 'Gender (male/female/other)', required: false },
  { field: 'admissionDate', label: 'Admission Date (YYYY-MM-DD)', required: false },
  { field: 'parentFirstName', label: 'Parent First Name', required: false },
  { field: 'parentPhone', label: 'Parent Phone', required: false },
  { field: 'parentEmail', label: 'Parent Email', required: false },
  { field: 'parentRelation', label: 'Parent Relation', required: false },
];

const staffRowSchema = z.object({
  employeeId: z.string().min(1).max(50),
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional(),
  designation: z.string().max(120).optional(),
  employmentType: z.enum(['permanent', 'contract', 'part_time', 'visiting']).optional(),
  qualification: z.string().max(200).optional(),
  dateOfJoining: z.string().date().optional(),
});
type StaffImportRow = z.infer<typeof staffRowSchema>;

const STAFF_TEMPLATE = [
  { field: 'employeeId', label: 'Employee ID', required: true },
  { field: 'firstName', label: 'First Name', required: true },
  { field: 'lastName', label: 'Last Name', required: false },
  { field: 'designation', label: 'Designation', required: false },
  { field: 'employmentType', label: 'Employment Type', required: false },
  { field: 'qualification', label: 'Qualification', required: false },
  { field: 'dateOfJoining', label: 'Date of Joining (YYYY-MM-DD)', required: false },
];

export async function importRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const view = { permission: 'student.view' };
  const manage = { permission: 'student.manage' };
  const staffView = { permission: 'staff.view' };
  const staffManage = { permission: 'staff.manage' };

  r.get(
    '/imports/students/template',
    { config: view, schema: { tags: ['imports'] } },
    async () => ({
      success: true as const,
      data: { columns: TEMPLATE },
    }),
  );

  r.get('/imports', { config: view, schema: { tags: ['imports'] } }, async (request) => {
    const rows = await request.tenantDb((db) =>
      db.select().from(importBatches).orderBy(desc(importBatches.createdAt)).limit(100),
    );
    return { success: true as const, data: rows };
  });

  r.post(
    '/imports/students',
    {
      config: manage,
      schema: {
        tags: ['imports'],
        body: z.object({
          branchId: z.string().uuid(),
          tag: z.string().max(120).optional(),
          dryRun: z.boolean().default(false),
          rows: z.array(z.record(z.string(), z.unknown())).min(1).max(1000),
        }),
      },
    },
    async (request, reply) => {
      const { branchId, tag, dryRun, rows } = request.body;

      // Validate every row; collect per-row errors (1-indexed for the user).
      const errors: Array<{ row: number; message: string }> = [];
      const valid: Array<{ row: number; data: ImportRow }> = [];
      const seen = new Set<string>();
      rows.forEach((raw, i) => {
        const line = i + 1;
        const res = rowSchema.safeParse(raw);
        if (!res.success) {
          errors.push({
            row: line,
            message: res.error.issues
              .map((x) => `${x.path.join('.') || 'row'}: ${x.message}`)
              .join('; '),
          });
          return;
        }
        if (seen.has(res.data.admissionNumber)) {
          errors.push({
            row: line,
            message: `duplicate admissionNumber '${res.data.admissionNumber}' in file`,
          });
          return;
        }
        seen.add(res.data.admissionNumber);
        valid.push({ row: line, data: res.data });
      });

      // Flag admission numbers that already exist for this tenant (RLS-scoped).
      if (valid.length > 0) {
        const nums = valid.map((v) => v.data.admissionNumber);
        const existing = await request.tenantDb((db) =>
          db
            .select({ a: students.admissionNumber })
            .from(students)
            .where(inArray(students.admissionNumber, nums)),
        );
        const taken = new Set(existing.map((e) => e.a));
        for (const v of valid) {
          if (taken.has(v.data.admissionNumber)) {
            errors.push({
              row: v.row,
              message: `admissionNumber '${v.data.admissionNumber}' already exists`,
            });
          }
        }
      }

      const errorRows = new Set(errors.map((e) => e.row));
      const committable = valid.filter((v) => !errorRows.has(v.row));

      if (dryRun) {
        return {
          success: true as const,
          data: { total: rows.length, valid: committable.length, invalid: errors.length, errors },
        };
      }

      // All-or-nothing: refuse to commit a batch with any invalid rows.
      if (errors.length > 0) {
        return reply.status(422).send({
          success: true as const,
          data: { committed: false, total: rows.length, valid: committable.length, errors },
        });
      }

      const result = await request.tenantDb(async (db) => {
        const [batch] = await db
          .insert(importBatches)
          .values({
            tenantId: request.tenant!.id,
            entityType: 'students',
            tag: tag ?? null,
            rowCount: committable.length,
            createdBy: request.auth!.userId,
          })
          .returning();

        let parentsCreated = 0;
        for (const { data: d } of committable) {
          const [stu] = await db
            .insert(students)
            .values({
              tenantId: request.tenant!.id,
              branchId,
              admissionNumber: d.admissionNumber,
              firstName: d.firstName,
              lastName: d.lastName ?? null,
              rollNumber: d.rollNumber ?? null,
              dateOfBirth: d.dateOfBirth ?? null,
              gender: d.gender ?? null,
              currentClassId: d.currentClassId ?? null,
              currentSectionId: d.currentSectionId ?? null,
              admissionDate: d.admissionDate ?? null,
              importBatchId: batch!.id,
            })
            .returning();
          if (d.parentFirstName) {
            const [par] = await db
              .insert(parents)
              .values({
                tenantId: request.tenant!.id,
                firstName: d.parentFirstName,
                lastName: d.parentLastName ?? null,
                relation: d.parentRelation ?? 'guardian',
                phone: d.parentPhone ?? null,
                email: d.parentEmail ?? null,
                importBatchId: batch!.id,
              })
              .returning();
            await db.insert(parentStudent).values({
              tenantId: request.tenant!.id,
              parentId: par!.id,
              studentId: stu!.id,
              relation: d.parentRelation ?? 'guardian',
              isPrimaryContact: true,
            });
            parentsCreated += 1;
          }
        }
        await writeAudit(db, request.auth!, {
          action: 'create',
          entityType: 'import_batch',
          entityId: batch!.id,
          newValues: { entityType: 'students', rowCount: committable.length, tag },
        });
        return { batchId: batch!.id, created: committable.length, parentsCreated };
      });

      return reply
        .status(201)
        .send({ success: true as const, data: { committed: true, ...result } });
    },
  );

  // ── Staff bulk import (P1-MOD-21): reuses the same framework ──
  r.get(
    '/imports/staff/template',
    { config: staffView, schema: { tags: ['imports'] } },
    async () => ({
      success: true as const,
      data: { columns: STAFF_TEMPLATE },
    }),
  );

  r.post(
    '/imports/staff',
    {
      config: staffManage,
      schema: {
        tags: ['imports'],
        body: z.object({
          branchId: z.string().uuid(),
          tag: z.string().max(120).optional(),
          dryRun: z.boolean().default(false),
          rows: z.array(z.record(z.string(), z.unknown())).min(1).max(1000),
        }),
      },
    },
    async (request, reply) => {
      const { branchId, tag, dryRun, rows } = request.body;

      const errors: Array<{ row: number; message: string }> = [];
      const valid: Array<{ row: number; data: StaffImportRow }> = [];
      const seen = new Set<string>();
      rows.forEach((raw, i) => {
        const line = i + 1;
        const res = staffRowSchema.safeParse(raw);
        if (!res.success) {
          errors.push({
            row: line,
            message: res.error.issues
              .map((x) => `${x.path.join('.') || 'row'}: ${x.message}`)
              .join('; '),
          });
          return;
        }
        if (seen.has(res.data.employeeId)) {
          errors.push({
            row: line,
            message: `duplicate employeeId '${res.data.employeeId}' in file`,
          });
          return;
        }
        seen.add(res.data.employeeId);
        valid.push({ row: line, data: res.data });
      });

      if (valid.length > 0) {
        const ids = valid.map((v) => v.data.employeeId);
        const existing = await request.tenantDb((db) =>
          db
            .select({ e: staffMembers.employeeId })
            .from(staffMembers)
            .where(inArray(staffMembers.employeeId, ids)),
        );
        const taken = new Set(existing.map((e) => e.e));
        for (const v of valid) {
          if (taken.has(v.data.employeeId)) {
            errors.push({
              row: v.row,
              message: `employeeId '${v.data.employeeId}' already exists`,
            });
          }
        }
      }

      const errorRows = new Set(errors.map((e) => e.row));
      const committable = valid.filter((v) => !errorRows.has(v.row));

      if (dryRun) {
        return {
          success: true as const,
          data: { total: rows.length, valid: committable.length, invalid: errors.length, errors },
        };
      }
      if (errors.length > 0) {
        return reply.status(422).send({
          success: true as const,
          data: { committed: false, total: rows.length, valid: committable.length, errors },
        });
      }

      const result = await request.tenantDb(async (db) => {
        const [batch] = await db
          .insert(importBatches)
          .values({
            tenantId: request.tenant!.id,
            entityType: 'staff',
            tag: tag ?? null,
            rowCount: committable.length,
            createdBy: request.auth!.userId,
          })
          .returning();
        for (const { data: d } of committable) {
          await db.insert(staffMembers).values({
            tenantId: request.tenant!.id,
            branchId,
            employeeId: d.employeeId,
            firstName: d.firstName,
            lastName: d.lastName ?? null,
            designation: d.designation ?? null,
            employmentType: d.employmentType ?? 'permanent',
            qualification: d.qualification ?? null,
            dateOfJoining: d.dateOfJoining ?? null,
            importBatchId: batch!.id,
          });
        }
        await writeAudit(db, request.auth!, {
          action: 'create',
          entityType: 'import_batch',
          entityId: batch!.id,
          newValues: { entityType: 'staff', rowCount: committable.length, tag },
        });
        return { batchId: batch!.id, created: committable.length };
      });

      return reply
        .status(201)
        .send({ success: true as const, data: { committed: true, ...result } });
    },
  );

  r.delete(
    '/imports/:id',
    { config: manage, schema: { tags: ['imports'], params: idParamSchema } },
    async (request) => {
      const result = await request.tenantDb(async (db) => {
        const [batch] = await db
          .select()
          .from(importBatches)
          .where(eq(importBatches.id, request.params.id))
          .limit(1);
        assertFound(batch, 'Import batch');

        const studentRows = await db
          .select({ n: count() })
          .from(students)
          .where(eq(students.importBatchId, batch.id));
        const staffRows = await db
          .select({ n: count() })
          .from(staffMembers)
          .where(eq(staffMembers.importBatchId, batch.id));

        // Delete whatever the batch created; unmatched tables are no-ops.
        // parent_student links cascade when a student is deleted.
        await db.delete(students).where(eq(students.importBatchId, batch.id));
        await db.delete(parents).where(eq(parents.importBatchId, batch.id));
        await db.delete(staffMembers).where(eq(staffMembers.importBatchId, batch.id));
        await db.delete(importBatches).where(eq(importBatches.id, batch.id));

        await writeAudit(db, request.auth!, {
          action: 'delete',
          entityType: 'import_batch',
          entityId: batch.id,
          oldValues: { entityType: batch.entityType, rowCount: batch.rowCount, tag: batch.tag },
        });
        return {
          rolledBack: true,
          studentsDeleted: studentRows[0]?.n ?? 0,
          staffDeleted: staffRows[0]?.n ?? 0,
        };
      });
      return { success: true as const, data: result };
    },
  );
}
