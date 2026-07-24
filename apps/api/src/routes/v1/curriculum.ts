/**
 * P1-MOD-07: class-subject mapping + subject-teacher assignment.
 * Both are tenant-scoped join tables guarded by the existing `subject`
 * permissions; writes are audited and atomic inside request.tenantDb (RLS).
 */
import { classSubjects, classes, staffMembers, subjectTeachers, subjects } from '@schoolmate/db';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { writeAudit } from '../../lib/audit.js';
import { assertFound, idParamSchema } from '../../lib/http.js';

export async function curriculumRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const view = { permission: 'subject.view' };
  const manage = { permission: 'subject.manage' };

  // ── Class ↔ subject mapping ─────────────────────────────────
  const mapSchema = z.object({
    classId: z.string().uuid(),
    subjectId: z.string().uuid(),
    academicSessionId: z.string().uuid(),
    isMandatory: z.boolean().optional(),
    weeklyPeriods: z.number().int().min(0).max(60).optional(),
  });

  r.post(
    '/class-subjects',
    { config: manage, schema: { tags: ['subjects'], body: mapSchema } },
    async (request, reply) => {
      const created = await request.tenantDb(async (db) => {
        const [cls] = await db
          .select({ id: classes.id })
          .from(classes)
          .where(eq(classes.id, request.body.classId))
          .limit(1);
        assertFound(cls, 'Class');
        const [subj] = await db
          .select({ id: subjects.id })
          .from(subjects)
          .where(eq(subjects.id, request.body.subjectId))
          .limit(1);
        assertFound(subj, 'Subject');

        const [row] = await db
          .insert(classSubjects)
          .values({ ...request.body, tenantId: request.tenant!.id })
          .returning();
        await writeAudit(db, request.auth!, {
          action: 'create',
          entityType: 'class_subject',
          entityId: row!.id,
          newValues: row,
        });
        return row!;
      });
      return reply.status(201).send({ success: true as const, data: created });
    },
  );

  const mapListQuery = z.object({
    classId: z.string().uuid().optional(),
    academicSessionId: z.string().uuid().optional(),
  });

  r.get(
    '/class-subjects',
    { config: view, schema: { tags: ['subjects'], querystring: mapListQuery } },
    async (request) => {
      const filters = [
        request.query.classId ? eq(classSubjects.classId, request.query.classId) : undefined,
        request.query.academicSessionId
          ? eq(classSubjects.academicSessionId, request.query.academicSessionId)
          : undefined,
      ].filter((f): f is NonNullable<typeof f> => f !== undefined);
      const where = filters.length ? and(...filters) : undefined;

      const rows = await request.tenantDb((db) =>
        db
          .select({
            id: classSubjects.id,
            classId: classSubjects.classId,
            academicSessionId: classSubjects.academicSessionId,
            isMandatory: classSubjects.isMandatory,
            weeklyPeriods: classSubjects.weeklyPeriods,
            subject: {
              id: subjects.id,
              name: subjects.name,
              code: subjects.code,
              subjectType: subjects.subjectType,
            },
          })
          .from(classSubjects)
          .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
          .where(where)
          .orderBy(subjects.name),
      );
      return { success: true as const, data: rows };
    },
  );

  r.delete(
    '/class-subjects/:id',
    { config: manage, schema: { tags: ['subjects'], params: idParamSchema } },
    async (request) => {
      await request.tenantDb(async (db) => {
        const [before] = await db
          .select()
          .from(classSubjects)
          .where(eq(classSubjects.id, request.params.id))
          .limit(1);
        assertFound(before, 'Class-subject mapping');
        await db.delete(classSubjects).where(eq(classSubjects.id, request.params.id));
        await writeAudit(db, request.auth!, {
          action: 'delete',
          entityType: 'class_subject',
          entityId: request.params.id,
          oldValues: before,
        });
      });
      return { success: true as const, data: { deleted: true } };
    },
  );

  // ── Subject ↔ teacher assignment ────────────────────────────
  const assignSchema = z.object({
    classId: z.string().uuid(),
    sectionId: z.string().uuid().optional(),
    subjectId: z.string().uuid(),
    academicSessionId: z.string().uuid(),
    staffId: z.string().uuid(),
    isPrimary: z.boolean().optional(),
  });

  r.post(
    '/subject-teachers',
    { config: manage, schema: { tags: ['subjects'], body: assignSchema } },
    async (request, reply) => {
      const created = await request.tenantDb(async (db) => {
        const [subj] = await db
          .select({ id: subjects.id })
          .from(subjects)
          .where(eq(subjects.id, request.body.subjectId))
          .limit(1);
        assertFound(subj, 'Subject');
        const [staff] = await db
          .select({ id: staffMembers.id })
          .from(staffMembers)
          .where(eq(staffMembers.id, request.body.staffId))
          .limit(1);
        assertFound(staff, 'Staff member');

        const [row] = await db
          .insert(subjectTeachers)
          .values({ ...request.body, tenantId: request.tenant!.id })
          .returning();
        await writeAudit(db, request.auth!, {
          action: 'create',
          entityType: 'subject_teacher',
          entityId: row!.id,
          newValues: row,
        });
        return row!;
      });
      return reply.status(201).send({ success: true as const, data: created });
    },
  );

  const assignListQuery = z.object({
    classId: z.string().uuid().optional(),
    sectionId: z.string().uuid().optional(),
    subjectId: z.string().uuid().optional(),
    academicSessionId: z.string().uuid().optional(),
    staffId: z.string().uuid().optional(),
  });

  r.get(
    '/subject-teachers',
    { config: view, schema: { tags: ['subjects'], querystring: assignListQuery } },
    async (request) => {
      const q = request.query;
      const filters = [
        q.classId ? eq(subjectTeachers.classId, q.classId) : undefined,
        q.sectionId ? eq(subjectTeachers.sectionId, q.sectionId) : undefined,
        q.subjectId ? eq(subjectTeachers.subjectId, q.subjectId) : undefined,
        q.academicSessionId
          ? eq(subjectTeachers.academicSessionId, q.academicSessionId)
          : undefined,
        q.staffId ? eq(subjectTeachers.staffId, q.staffId) : undefined,
      ].filter((f): f is NonNullable<typeof f> => f !== undefined);
      const where = filters.length ? and(...filters) : undefined;

      const rows = await request.tenantDb((db) =>
        db
          .select({
            id: subjectTeachers.id,
            classId: subjectTeachers.classId,
            sectionId: subjectTeachers.sectionId,
            academicSessionId: subjectTeachers.academicSessionId,
            isPrimary: subjectTeachers.isPrimary,
            subject: { id: subjects.id, name: subjects.name, code: subjects.code },
            teacher: {
              id: staffMembers.id,
              firstName: staffMembers.firstName,
              lastName: staffMembers.lastName,
              employeeId: staffMembers.employeeId,
            },
          })
          .from(subjectTeachers)
          .innerJoin(subjects, eq(subjects.id, subjectTeachers.subjectId))
          .innerJoin(staffMembers, eq(staffMembers.id, subjectTeachers.staffId))
          .where(where)
          .orderBy(subjects.name),
      );
      return { success: true as const, data: rows };
    },
  );

  r.delete(
    '/subject-teachers/:id',
    { config: manage, schema: { tags: ['subjects'], params: idParamSchema } },
    async (request) => {
      await request.tenantDb(async (db) => {
        const [before] = await db
          .select()
          .from(subjectTeachers)
          .where(eq(subjectTeachers.id, request.params.id))
          .limit(1);
        assertFound(before, 'Subject-teacher assignment');
        await db.delete(subjectTeachers).where(eq(subjectTeachers.id, request.params.id));
        await writeAudit(db, request.auth!, {
          action: 'delete',
          entityType: 'subject_teacher',
          entityId: request.params.id,
          oldValues: before,
        });
      });
      return { success: true as const, data: { deleted: true } };
    },
  );
}
