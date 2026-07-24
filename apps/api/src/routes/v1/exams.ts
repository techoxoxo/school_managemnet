/**
 * P2-MOD-13: grading systems. Presets (CBSE/GPA/percentage) + custom scales.
 * Exams/datesheet/marks build on this in later tasks.
 */
import {
  examResults,
  examSubjects,
  examTypes,
  exams,
  gradingSystems,
  staffMembers,
  students,
  subjectTeachers,
} from '@schoolmate/db';
import {
  AppError,
  ErrorCodes,
  GRADING_PRESETS,
  gradeForPercentage,
  type GradingScale,
} from '@schoolmate/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { writeAudit } from '../../lib/audit.js';
import { assertFound, idParamSchema } from '../../lib/http.js';

const scaleSchema = z.array(
  z.object({
    grade: z.string().min(1).max(10),
    min: z.number().int().min(0).max(100),
    max: z.number().int().min(0).max(100),
    points: z.number().min(0).max(100),
  }),
);

export async function examRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const view = { permission: 'exam.view' };
  const manage = { permission: 'exam.manage' };

  r.get('/grading-systems/presets', { config: view, schema: { tags: ['exams'] } }, async () => ({
    success: true as const,
    data: Object.values(GRADING_PRESETS),
  }));

  r.get(
    '/grading-systems',
    {
      config: view,
      schema: {
        tags: ['exams'],
        querystring: z.object({ branchId: z.string().uuid().optional() }),
      },
    },
    async (request) => {
      const rows = await request.tenantDb((db) =>
        db
          .select()
          .from(gradingSystems)
          .where(
            request.query.branchId
              ? eq(gradingSystems.branchId, request.query.branchId)
              : undefined,
          )
          .orderBy(asc(gradingSystems.name)),
      );
      return { success: true as const, data: rows };
    },
  );

  r.post(
    '/grading-systems',
    {
      config: manage,
      schema: {
        tags: ['exams'],
        body: z.object({
          branchId: z.string().uuid(),
          name: z.string().min(1).max(120),
          type: z.enum(['percentage', 'gpa', 'letter']).optional(),
          scale: scaleSchema,
          isDefault: z.boolean().optional(),
        }),
      },
    },
    async (request, reply) => {
      const created = await request.tenantDb(async (db) => {
        const [row] = await db
          .insert(gradingSystems)
          .values({
            tenantId: request.tenant!.id,
            branchId: request.body.branchId,
            name: request.body.name,
            type: request.body.type ?? 'letter',
            scale: request.body.scale,
            isDefault: request.body.isDefault ?? false,
          })
          .returning();
        await writeAudit(db, request.auth!, {
          action: 'create',
          entityType: 'grading_system',
          entityId: row!.id,
          newValues: { name: row!.name, bands: request.body.scale.length },
        });
        return row!;
      });
      return reply.status(201).send({ success: true as const, data: created });
    },
  );

  r.post(
    '/grading-systems/from-preset',
    {
      config: manage,
      schema: {
        tags: ['exams'],
        body: z.object({
          branchId: z.string().uuid(),
          preset: z.enum(['cbse', 'gpa4', 'percentage']),
          name: z.string().min(1).max(120).optional(),
        }),
      },
    },
    async (request, reply) => {
      const preset = GRADING_PRESETS[request.body.preset];
      const created = await request.tenantDb(async (db) => {
        const [row] = await db
          .insert(gradingSystems)
          .values({
            tenantId: request.tenant!.id,
            branchId: request.body.branchId,
            name: request.body.name ?? preset.name,
            type: preset.type,
            scale: preset.scale,
          })
          .returning();
        await writeAudit(db, request.auth!, {
          action: 'create',
          entityType: 'grading_system',
          entityId: row!.id,
          newValues: { preset: request.body.preset, name: row!.name },
        });
        return row!;
      });
      return reply.status(201).send({ success: true as const, data: created });
    },
  );

  r.delete(
    '/grading-systems/:id',
    { config: manage, schema: { tags: ['exams'], params: idParamSchema } },
    async (request) => {
      await request.tenantDb(async (db) => {
        const [before] = await db
          .select()
          .from(gradingSystems)
          .where(eq(gradingSystems.id, request.params.id))
          .limit(1);
        assertFound(before, 'Grading system');
        await db.delete(gradingSystems).where(eq(gradingSystems.id, request.params.id));
        await writeAudit(db, request.auth!, {
          action: 'delete',
          entityType: 'grading_system',
          entityId: request.params.id,
          oldValues: { name: before.name },
        });
      });
      return { success: true as const, data: { deleted: true } };
    },
  );

  // ── Exam types (P2-MOD-14) ──────────────────────────────────
  r.post(
    '/exam-types',
    {
      config: manage,
      schema: {
        tags: ['exams'],
        body: z.object({
          branchId: z.string().uuid(),
          name: z.string().min(1).max(80),
          weightage: z.number().int().min(0).max(100).optional(),
        }),
      },
    },
    async (request, reply) => {
      const created = await request.tenantDb(async (db) => {
        const [row] = await db
          .insert(examTypes)
          .values({
            tenantId: request.tenant!.id,
            branchId: request.body.branchId,
            name: request.body.name,
            weightage: request.body.weightage ?? 100,
          })
          .returning();
        return row!;
      });
      return reply.status(201).send({ success: true as const, data: created });
    },
  );

  r.get(
    '/exam-types',
    {
      config: view,
      schema: {
        tags: ['exams'],
        querystring: z.object({ branchId: z.string().uuid().optional() }),
      },
    },
    async (request) => {
      const rows = await request.tenantDb((db) =>
        db
          .select()
          .from(examTypes)
          .where(
            request.query.branchId ? eq(examTypes.branchId, request.query.branchId) : undefined,
          )
          .orderBy(asc(examTypes.name)),
      );
      return { success: true as const, data: rows };
    },
  );

  // ── Exams (P2-MOD-14) ───────────────────────────────────────
  r.post(
    '/exams',
    {
      config: manage,
      schema: {
        tags: ['exams'],
        body: z.object({
          branchId: z.string().uuid(),
          academicSessionId: z.string().uuid(),
          examTypeId: z.string().uuid().optional(),
          classId: z.string().uuid().optional(),
          gradingSystemId: z.string().uuid().optional(),
          name: z.string().min(1).max(120),
          maxMarks: z.number().int().min(1).max(1000).optional(),
          startDate: z.string().date().optional(),
          endDate: z.string().date().optional(),
        }),
      },
    },
    async (request, reply) => {
      const created = await request.tenantDb(async (db) => {
        const [row] = await db
          .insert(exams)
          .values({ ...request.body, tenantId: request.tenant!.id })
          .returning();
        await writeAudit(db, request.auth!, {
          action: 'create',
          entityType: 'exam',
          entityId: row!.id,
          newValues: { name: row!.name },
        });
        return row!;
      });
      return reply.status(201).send({ success: true as const, data: created });
    },
  );

  r.get(
    '/exams',
    {
      config: view,
      schema: {
        tags: ['exams'],
        querystring: z.object({
          branchId: z.string().uuid().optional(),
          academicSessionId: z.string().uuid().optional(),
          classId: z.string().uuid().optional(),
        }),
      },
    },
    async (request) => {
      const filters = [
        request.query.branchId ? eq(exams.branchId, request.query.branchId) : undefined,
        request.query.academicSessionId
          ? eq(exams.academicSessionId, request.query.academicSessionId)
          : undefined,
        request.query.classId ? eq(exams.classId, request.query.classId) : undefined,
      ].filter((f): f is NonNullable<typeof f> => f !== undefined);
      const rows = await request.tenantDb((db) =>
        db
          .select()
          .from(exams)
          .where(filters.length ? and(...filters) : undefined)
          .orderBy(asc(exams.startDate)),
      );
      return { success: true as const, data: rows };
    },
  );

  r.get(
    '/exams/:id',
    { config: view, schema: { tags: ['exams'], params: idParamSchema } },
    async (request) => {
      const data = await request.tenantDb(async (db) => {
        const [exam] = await db
          .select()
          .from(exams)
          .where(eq(exams.id, request.params.id))
          .limit(1);
        assertFound(exam, 'Exam');
        const datesheet = await db
          .select()
          .from(examSubjects)
          .where(eq(examSubjects.examId, exam.id))
          .orderBy(asc(examSubjects.examDate));
        return { ...exam, datesheet };
      });
      return { success: true as const, data };
    },
  );

  r.patch(
    '/exams/:id',
    {
      config: manage,
      schema: {
        tags: ['exams'],
        params: idParamSchema,
        body: z.object({
          status: z.enum(['draft', 'scheduled', 'ongoing', 'completed']).optional(),
          name: z.string().min(1).max(120).optional(),
          gradingSystemId: z.string().uuid().optional(),
        }),
      },
    },
    async (request) => {
      const updated = await request.tenantDb(async (db) => {
        const [before] = await db
          .select()
          .from(exams)
          .where(eq(exams.id, request.params.id))
          .limit(1);
        assertFound(before, 'Exam');
        const [row] = await db
          .update(exams)
          .set({ ...request.body, updatedAt: new Date() })
          .where(eq(exams.id, request.params.id))
          .returning();
        return row!;
      });
      return { success: true as const, data: updated };
    },
  );

  // ── Datesheet: add a subject paper, with same-day conflict check ──
  r.post(
    '/exams/:id/subjects',
    {
      config: manage,
      schema: {
        tags: ['exams'],
        params: idParamSchema,
        body: z.object({
          subjectId: z.string().uuid(),
          examDate: z.string().date().optional(),
          startTime: z
            .string()
            .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
            .optional(),
          maxMarks: z.number().int().min(1).max(1000).optional(),
          passMarks: z.number().int().min(0).max(1000).optional(),
        }),
      },
    },
    async (request, reply) => {
      const created = await request.tenantDb(async (db) => {
        const [exam] = await db
          .select({ id: exams.id })
          .from(exams)
          .where(eq(exams.id, request.params.id))
          .limit(1);
        assertFound(exam, 'Exam');
        // Datesheet conflict: this class can't sit two papers the same day.
        if (request.body.examDate) {
          const clash = await db
            .select({ id: examSubjects.id })
            .from(examSubjects)
            .where(
              and(
                eq(examSubjects.examId, request.params.id),
                eq(examSubjects.examDate, request.body.examDate),
              ),
            )
            .limit(1);
          if (clash.length > 0) {
            throw new AppError(
              ErrorCodes.CONFLICT,
              `Another paper is already scheduled on ${request.body.examDate}`,
              409,
            );
          }
        }
        const [row] = await db
          .insert(examSubjects)
          .values({
            tenantId: request.tenant!.id,
            examId: request.params.id,
            subjectId: request.body.subjectId,
            examDate: request.body.examDate ?? null,
            startTime: request.body.startTime ?? null,
            maxMarks: request.body.maxMarks ?? 100,
            passMarks: request.body.passMarks ?? 33,
          })
          .returning();
        return row!;
      });
      return reply.status(201).send({ success: true as const, data: created });
    },
  );

  // ── Marks entry (P2-MOD-15) + verification (P2-MOD-16) ──────
  const marks = { permission: 'exam.marks' };

  const gradeFor = (scale: GradingScale, marks: number | null, maxMarks: number): string | null => {
    if (marks == null || scale.length === 0 || maxMarks <= 0) return null;
    return gradeForPercentage(scale, (marks / maxMarks) * 100)?.grade ?? null;
  };

  r.post(
    '/exam-subjects/:id/marks',
    {
      config: marks,
      schema: {
        tags: ['exams'],
        params: idParamSchema,
        body: z.object({
          entries: z
            .array(
              z.object({
                studentId: z.string().uuid(),
                marksObtained: z.number().int().min(0).max(1000).optional(),
                isAbsent: z.boolean().optional(),
                isExempt: z.boolean().optional(),
              }),
            )
            .min(1)
            .max(500),
        }),
      },
    },
    async (request) => {
      const result = await request.tenantDb(async (db) => {
        const [es] = await db
          .select()
          .from(examSubjects)
          .where(eq(examSubjects.id, request.params.id))
          .limit(1);
        assertFound(es, 'Exam subject');

        // Teacher ABAC: teachers may only enter marks for subjects they teach.
        if (request.auth!.role === 'teacher') {
          const [staff] = await db
            .select({ id: staffMembers.id })
            .from(staffMembers)
            .where(eq(staffMembers.userId, request.auth!.userId))
            .limit(1);
          const assigned = staff
            ? await db
                .select({ id: subjectTeachers.id })
                .from(subjectTeachers)
                .where(
                  and(
                    eq(subjectTeachers.staffId, staff.id),
                    eq(subjectTeachers.subjectId, es.subjectId),
                  ),
                )
                .limit(1)
            : [];
          if (assigned.length === 0) {
            throw new AppError(ErrorCodes.FORBIDDEN, 'You do not teach this subject', 403);
          }
        }

        // Locked results are immutable.
        const ids = request.body.entries.map((e) => e.studentId);
        const locked = await db
          .select({ studentId: examResults.studentId })
          .from(examResults)
          .where(
            and(
              eq(examResults.examSubjectId, es.id),
              eq(examResults.status, 'locked'),
              inArray(examResults.studentId, ids),
            ),
          );
        if (locked.length > 0) {
          throw new AppError(
            ErrorCodes.CONFLICT,
            'Some results are locked and cannot be changed',
            409,
          );
        }

        let scale: GradingScale = [];
        const [exam] = await db.select().from(exams).where(eq(exams.id, es.examId)).limit(1);
        if (exam?.gradingSystemId) {
          const [gs] = await db
            .select()
            .from(gradingSystems)
            .where(eq(gradingSystems.id, exam.gradingSystemId))
            .limit(1);
          scale = (gs?.scale ?? []) as GradingScale;
        }

        for (const e of request.body.entries) {
          const marksObtained = e.isAbsent || e.isExempt ? null : (e.marksObtained ?? null);
          const grade =
            e.isAbsent || e.isExempt ? null : gradeFor(scale, marksObtained, es.maxMarks);
          await db
            .insert(examResults)
            .values({
              tenantId: request.tenant!.id,
              examId: es.examId,
              examSubjectId: es.id,
              studentId: e.studentId,
              marksObtained,
              isAbsent: e.isAbsent ?? false,
              isExempt: e.isExempt ?? false,
              grade,
              status: 'entered',
              enteredBy: request.auth!.userId,
            })
            .onConflictDoUpdate({
              target: [examResults.tenantId, examResults.examSubjectId, examResults.studentId],
              set: {
                marksObtained,
                isAbsent: e.isAbsent ?? false,
                isExempt: e.isExempt ?? false,
                grade,
                status: 'entered',
                enteredBy: request.auth!.userId,
                updatedAt: new Date(),
              },
            });
        }
        await writeAudit(db, request.auth!, {
          action: 'create',
          entityType: 'exam_marks',
          entityId: es.id,
          newValues: { count: request.body.entries.length },
        });
        return { saved: request.body.entries.length };
      });
      return { success: true as const, data: result };
    },
  );

  r.get(
    '/exam-subjects/:id/marks',
    { config: view, schema: { tags: ['exams'], params: idParamSchema } },
    async (request) => {
      const data = await request.tenantDb(async (db) => {
        const [es] = await db
          .select()
          .from(examSubjects)
          .where(eq(examSubjects.id, request.params.id))
          .limit(1);
        assertFound(es, 'Exam subject');
        const [exam] = await db.select().from(exams).where(eq(exams.id, es.examId)).limit(1);
        const roster = exam?.classId
          ? await db
              .select({
                id: students.id,
                firstName: students.firstName,
                lastName: students.lastName,
                rollNumber: students.rollNumber,
              })
              .from(students)
              .where(and(eq(students.currentClassId, exam.classId), eq(students.status, 'active')))
              .orderBy(asc(students.rollNumber))
          : [];
        const results = await db
          .select()
          .from(examResults)
          .where(eq(examResults.examSubjectId, es.id));
        const byStudent = new Map(results.map((r2) => [r2.studentId, r2]));
        return {
          maxMarks: es.maxMarks,
          passMarks: es.passMarks,
          rows: roster.map((s) => {
            const r2 = byStudent.get(s.id);
            return {
              studentId: s.id,
              name: [s.firstName, s.lastName].filter(Boolean).join(' '),
              rollNumber: s.rollNumber,
              marksObtained: r2?.marksObtained ?? null,
              isAbsent: r2?.isAbsent ?? false,
              isExempt: r2?.isExempt ?? false,
              grade: r2?.grade ?? null,
              status: r2?.status ?? null,
            };
          }),
        };
      });
      return { success: true as const, data };
    },
  );

  const transition = (from: 'entered' | 'verified', to: 'verified' | 'locked') =>
    async function (request: FastifyRequest) {
      const result = await request.tenantDb(async (db) => {
        const [es] = await db
          .select({ id: examSubjects.id })
          .from(examSubjects)
          .where(eq(examSubjects.id, (request.params as { id: string }).id))
          .limit(1);
        assertFound(es, 'Exam subject');
        const rows = await db
          .update(examResults)
          .set({ status: to, verifiedBy: request.auth!.userId, updatedAt: new Date() })
          .where(and(eq(examResults.examSubjectId, es.id), eq(examResults.status, from)))
          .returning({ id: examResults.id });
        await writeAudit(db, request.auth!, {
          action: 'update',
          entityType: 'exam_marks',
          entityId: es.id,
          newValues: { transition: `${from}→${to}`, count: rows.length },
        });
        return { [to]: rows.length } as Record<string, number>;
      });
      return { success: true as const, data: result };
    };

  r.post(
    '/exam-subjects/:id/verify',
    { config: manage, schema: { tags: ['exams'], params: idParamSchema } },
    transition('entered', 'verified'),
  );
  r.post(
    '/exam-subjects/:id/lock',
    { config: manage, schema: { tags: ['exams'], params: idParamSchema } },
    transition('verified', 'locked'),
  );
}
