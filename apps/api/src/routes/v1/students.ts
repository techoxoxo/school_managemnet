import { emitEvent, parents, parentStudent, students } from '@schoolmate/db';
import { EVENT_TYPES, hasPermission } from '@schoolmate/shared';
import { and, count, eq, ilike, inArray, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AuthContext } from '../../plugins/auth.js';
import { writeAudit } from '../../lib/audit.js';
import { decryptField, encryptField, maskId } from '../../lib/encryption.js';
import { assertFound, idParamSchema, listQuerySchema, paginationMeta } from '../../lib/http.js';
import {
  indexStudent,
  removeStudent,
  reindexStudents,
  searchStudentIds,
  toStudentDoc,
} from '../../lib/search.js';

const createSchema = z.object({
  branchId: z.string().uuid(),
  admissionNumber: z.string().min(1).max(50),
  rollNumber: z.string().max(30).optional(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional(),
  dateOfBirth: z.string().date().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  bloodGroup: z.string().max(5).optional(),
  category: z.string().max(50).optional(),
  /** Plaintext in transit only; stored AES-256-GCM encrypted. */
  govtId: z.string().min(4).max(30).optional(),
  currentClassId: z.string().uuid().optional(),
  currentSectionId: z.string().uuid().optional(),
  admissionDate: z.string().date().optional(),
  transportOpted: z.boolean().optional(),
  hostelOpted: z.boolean().optional(),
});

const updateSchema = createSchema.partial().extend({
  status: z.enum(['active', 'alumni', 'transferred', 'expelled', 'dropout', 'passout']).optional(),
  statusReason: z.string().max(300).optional(),
});

type StudentRow = typeof students.$inferSelect;

/** Never return raw ciphertext. Decrypt only with the sensitive permission. */
function present(row: StudentRow, auth: AuthContext) {
  const { govtIdEncrypted, ...rest } = row;
  let govtId: string | null = null;
  if (govtIdEncrypted) {
    govtId = hasPermission(auth.permissions, 'student.view_sensitive')
      ? decryptField(govtIdEncrypted, auth.tenantId)
      : maskId(decryptField(govtIdEncrypted, auth.tenantId));
  }
  return { ...rest, govtId };
}

export async function studentRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const view = { permission: 'student.view' };
  const manage = { permission: 'student.manage' };

  const listQuery = listQuerySchema.extend({
    branchId: z.string().uuid().optional(),
    classId: z.string().uuid().optional(),
    sectionId: z.string().uuid().optional(),
    status: z.string().optional(),
  });

  r.get(
    '/students',
    { config: view, schema: { tags: ['students'], querystring: listQuery } },
    async (request) => {
      const { page, limit, q, branchId, classId, sectionId, status } = request.query;
      const filters = [
        q ? ilike(students.firstName, `%${q}%`) : undefined,
        branchId ? eq(students.branchId, branchId) : undefined,
        classId ? eq(students.currentClassId, classId) : undefined,
        sectionId ? eq(students.currentSectionId, sectionId) : undefined,
        status ? eq(students.status, status as StudentRow['status']) : undefined,
      ].filter((f): f is NonNullable<typeof f> => f !== undefined);
      const where = filters.length ? and(...filters) : undefined;

      const [rows, [total]] = await request.tenantDb((db) =>
        Promise.all([
          db
            .select()
            .from(students)
            .where(where)
            .orderBy(students.firstName)
            .limit(limit)
            .offset((page - 1) * limit),
          db.select({ n: count() }).from(students).where(where),
        ]),
      );
      return {
        success: true as const,
        data: rows.map((row) => present(row, request.auth!)),
        meta: paginationMeta(total?.n ?? 0, page, limit),
      };
    },
  );

  r.post(
    '/students',
    { config: manage, schema: { tags: ['students'], body: createSchema } },
    async (request, reply) => {
      const { govtId, ...body } = request.body;
      const created = await request.tenantDb(async (db) => {
        const [row] = await db
          .insert(students)
          .values({
            ...body,
            tenantId: request.tenant!.id,
            govtIdEncrypted: govtId ? encryptField(govtId, request.tenant!.id) : null,
          })
          .returning();
        await writeAudit(db, request.auth!, {
          action: 'create',
          entityType: 'student',
          entityId: row!.id,
          // Never audit-log the plaintext ID.
          newValues: { ...row, govtIdEncrypted: row!.govtIdEncrypted ? '[encrypted]' : null },
        });
        // Atomic with the insert (transactional outbox) — welcome emails,
        // analytics, webhooks consume this asynchronously (Plan §17).
        await emitEvent(db, {
          tenantId: request.tenant!.id,
          type: EVENT_TYPES.STUDENT_ADMITTED,
          aggregateType: 'student',
          aggregateId: row!.id,
          payload: {
            studentId: row!.id,
            admissionNumber: row!.admissionNumber,
            branchId: row!.branchId,
          },
        });
        return row!;
      });
      indexStudent(toStudentDoc(created)); // best-effort search index (P1-MOD-17)
      return reply
        .status(201)
        .send({ success: true as const, data: present(created, request.auth!) });
    },
  );

  r.get(
    '/students/:id',
    { config: view, schema: { tags: ['students'], params: idParamSchema } },
    async (request) => {
      const [row] = await request.tenantDb((db) =>
        db.select().from(students).where(eq(students.id, request.params.id)).limit(1),
      );
      assertFound(row, 'Student');
      return { success: true as const, data: present(row, request.auth!) };
    },
  );

  r.patch(
    '/students/:id',
    { config: manage, schema: { tags: ['students'], params: idParamSchema, body: updateSchema } },
    async (request) => {
      const { govtId, ...body } = request.body;
      const updated = await request.tenantDb(async (db) => {
        const [before] = await db
          .select()
          .from(students)
          .where(eq(students.id, request.params.id))
          .limit(1);
        assertFound(before, 'Student');
        const [row] = await db
          .update(students)
          .set({
            ...body,
            ...(govtId !== undefined
              ? { govtIdEncrypted: encryptField(govtId, request.tenant!.id) }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(students.id, request.params.id))
          .returning();
        await writeAudit(db, request.auth!, {
          action: 'update',
          entityType: 'student',
          entityId: row!.id,
          oldValues: { ...before, govtIdEncrypted: before.govtIdEncrypted ? '[encrypted]' : null },
          newValues: { ...row, govtIdEncrypted: row!.govtIdEncrypted ? '[encrypted]' : null },
        });
        return row!;
      });
      indexStudent(toStudentDoc(updated)); // keep the search index in sync (P1-MOD-17)
      return { success: true as const, data: present(updated, request.auth!) };
    },
  );

  r.delete(
    '/students/:id',
    { config: manage, schema: { tags: ['students'], params: idParamSchema } },
    async (request) => {
      await request.tenantDb(async (db) => {
        const [before] = await db
          .select()
          .from(students)
          .where(eq(students.id, request.params.id))
          .limit(1);
        assertFound(before, 'Student');
        await db.delete(students).where(eq(students.id, request.params.id));
        await writeAudit(db, request.auth!, {
          action: 'delete',
          entityType: 'student',
          entityId: request.params.id,
        });
      });
      removeStudent(request.params.id); // drop from the search index (P1-MOD-17)
      return { success: true as const, data: { deleted: true } };
    },
  );

  // ── Parent linking ────────────────────────────────────────
  const linkSchema = z.object({
    parentId: z.string().uuid(),
    relation: z.enum(['father', 'mother', 'guardian', 'other']).optional(),
    isPrimaryContact: z.boolean().optional(),
    canPickup: z.boolean().optional(),
  });

  r.post(
    '/students/:id/parents',
    { config: manage, schema: { tags: ['students'], params: idParamSchema, body: linkSchema } },
    async (request, reply) => {
      const link = await request.tenantDb(async (db) => {
        const [student] = await db
          .select({ id: students.id })
          .from(students)
          .where(eq(students.id, request.params.id))
          .limit(1);
        assertFound(student, 'Student');
        const [row] = await db
          .insert(parentStudent)
          .values({ ...request.body, tenantId: request.tenant!.id, studentId: request.params.id })
          .returning();
        await writeAudit(db, request.auth!, {
          action: 'create',
          entityType: 'parent_student',
          entityId: row!.id,
          newValues: row,
        });
        return row!;
      });
      return reply.status(201).send({ success: true as const, data: link });
    },
  );

  r.get(
    '/students/:id/parents',
    { config: view, schema: { tags: ['students'], params: idParamSchema } },
    async (request) => {
      const rows = await request.tenantDb((db) =>
        db
          .select({
            linkId: parentStudent.id,
            relation: parentStudent.relation,
            isPrimaryContact: parentStudent.isPrimaryContact,
            canPickup: parentStudent.canPickup,
            parent: parents,
          })
          .from(parentStudent)
          .innerJoin(parents, eq(parents.id, parentStudent.parentId))
          .where(eq(parentStudent.studentId, request.params.id)),
      );
      return { success: true as const, data: rows };
    },
  );

  // ── Sibling detection (P1-MOD-15): students sharing any parent ─────
  r.get(
    '/students/:id/siblings',
    { config: view, schema: { tags: ['students'], params: idParamSchema } },
    async (request) => {
      const siblings = await request.tenantDb(async (db) => {
        const parentLinks = await db
          .select({ parentId: parentStudent.parentId })
          .from(parentStudent)
          .where(eq(parentStudent.studentId, request.params.id));
        if (parentLinks.length === 0) return [];
        const parentIds = parentLinks.map((p) => p.parentId);

        const siblingLinks = await db
          .select({ studentId: parentStudent.studentId })
          .from(parentStudent)
          .where(inArray(parentStudent.parentId, parentIds));
        const siblingIds = [...new Set(siblingLinks.map((s) => s.studentId))].filter(
          (sid) => sid !== request.params.id,
        );
        if (siblingIds.length === 0) return [];

        return db.select().from(students).where(inArray(students.id, siblingIds));
      });
      return {
        success: true as const,
        data: siblings.map((row) => present(row, request.auth!)),
      };
    },
  );

  // ── Full-text search (P1-MOD-17, Meilisearch) ──────────────
  // Meili returns matching ids (tenant-filtered); rows are re-loaded under RLS
  // and run through present(), so masking/permissions still apply.
  r.get(
    '/students/search',
    {
      config: view,
      schema: {
        tags: ['students'],
        querystring: z.object({
          q: z.string().min(1),
          classId: z.string().uuid().optional(),
          sectionId: z.string().uuid().optional(),
          status: z.string().optional(),
        }),
      },
    },
    async (request) => {
      const { q, classId, sectionId, status } = request.query;
      const ids = await searchStudentIds(request.tenant!.id, q, { classId, sectionId, status });
      if (ids.length === 0) return { success: true as const, data: [] };
      const rows = await request.tenantDb((db) =>
        db.select().from(students).where(inArray(students.id, ids)),
      );
      const byId = new Map(rows.map((row) => [row.id, row]));
      const ordered = ids
        .map((id) => byId.get(id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
      return { success: true as const, data: ordered.map((row) => present(row, request.auth!)) };
    },
  );

  // Backfill the index for this tenant (after bulk import or first setup).
  r.post(
    '/students/reindex',
    { config: manage, schema: { tags: ['students'] } },
    async (request) => {
      const rows = await request.tenantDb((db) => db.select().from(students));
      await reindexStudents(rows.map(toStudentDoc));
      return { success: true as const, data: { indexed: rows.length } };
    },
  );

  void or; // reserved for multi-term search as filters grow
}
