/**
 * P2-MOD-13: grading systems. Presets (CBSE/GPA/percentage) + custom scales.
 * Exams/datesheet/marks build on this in later tasks.
 */
import {
  classes,
  emitEvent,
  examResults,
  examSubjects,
  examTypes,
  exams,
  gradingSystems,
  reportCards,
  staffMembers,
  students,
  subjects,
  subjectTeachers,
} from '@schoolmate/db';
import {
  AppError,
  ErrorCodes,
  EVENT_TYPES,
  GRADING_PRESETS,
  gradeForPercentage,
  type GradingScale,
} from '@schoolmate/shared';
import { and, asc, count, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { TenantDb } from '@schoolmate/db';
import { writeAudit } from '../../lib/audit.js';
import { assertFound, idParamSchema } from '../../lib/http.js';
import { htmlToPdf } from '../../lib/pdf.js';
import { putObject } from '../../lib/storage.js';
import {
  renderReportCardHtml,
  type ReportCardData,
  type ReportCardTemplate,
} from '../../lib/report-card-template.js';

/** Deterministic S3 key for a cached report-card PDF (P2-MOD-20). */
export function reportCardKey(tenantId: string, examId: string, studentId: string): string {
  return `tenants/${tenantId}/report-cards/${examId}/${studentId}.pdf`;
}

/**
 * Assemble report-card render data for one or all students of an exam. Shared
 * by the on-demand PDF endpoint (P2-MOD-18) and bulk generation (P2-MOD-20).
 * Returns the exam name plus one entry per report card (optionally only the
 * published ones), each carrying the studentId and the template payload.
 */
async function assembleReportCards(
  db: TenantDb,
  schoolName: string,
  examId: string,
  opts: { studentId?: string; publishedOnly?: boolean } = {},
): Promise<{ examName: string; cards: Array<{ studentId: string; data: ReportCardData }> }> {
  const [exam] = await db
    .select({ name: exams.name })
    .from(exams)
    .where(eq(exams.id, examId))
    .limit(1);
  assertFound(exam, 'Exam');

  const cardFilters = [
    eq(reportCards.examId, examId),
    opts.studentId ? eq(reportCards.studentId, opts.studentId) : undefined,
    opts.publishedOnly ? isNotNull(reportCards.publishedAt) : undefined,
  ].filter((f): f is NonNullable<typeof f> => f !== undefined);
  const cards = await db
    .select()
    .from(reportCards)
    .where(and(...cardFilters));
  if (cards.length === 0) return { examName: exam.name, cards: [] };

  const studentIds = cards.map((c) => c.studentId);
  const roster = await db
    .select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      admissionNumber: students.admissionNumber,
      className: classes.name,
    })
    .from(students)
    .leftJoin(classes, eq(classes.id, students.currentClassId))
    .where(inArray(students.id, studentIds));
  const studentById = new Map(roster.map((s) => [s.id, s]));

  const subjectRows = await db
    .select({
      studentId: examResults.studentId,
      subject: subjects.name,
      marks: examResults.marksObtained,
      maxMarks: examSubjects.maxMarks,
      grade: examResults.grade,
      isAbsent: examResults.isAbsent,
      isExempt: examResults.isExempt,
    })
    .from(examResults)
    .innerJoin(examSubjects, eq(examSubjects.id, examResults.examSubjectId))
    .innerJoin(subjects, eq(subjects.id, examSubjects.subjectId))
    .where(and(eq(examResults.examId, examId), inArray(examResults.studentId, studentIds)))
    .orderBy(asc(subjects.name));
  const subjectsByStudent = new Map<string, typeof subjectRows>();
  for (const row of subjectRows) {
    const arr = subjectsByStudent.get(row.studentId) ?? [];
    arr.push(row);
    subjectsByStudent.set(row.studentId, arr);
  }

  const out = cards.map((card) => {
    const student = studentById.get(card.studentId);
    const rows = subjectsByStudent.get(card.studentId) ?? [];
    const data: ReportCardData = {
      schoolName,
      examName: exam.name,
      studentName: [student?.firstName, student?.lastName].filter(Boolean).join(' '),
      admissionNumber: student?.admissionNumber ?? '',
      className: student?.className ?? null,
      subjects: rows.map((s) => ({
        subject: s.subject,
        marks: s.isAbsent || s.isExempt ? null : s.marks,
        maxMarks: s.maxMarks,
        grade: s.grade,
        status: s.isExempt ? 'exempt' : s.isAbsent ? 'absent' : 'ok',
      })),
      totalMarks: card.totalMarks,
      maxMarks: card.maxMarks,
      percentage: card.percentageBp == null ? null : card.percentageBp / 100,
      grade: card.grade,
      rank: card.rank,
    };
    return { studentId: card.studentId, data };
  });
  return { examName: exam.name, cards: out };
}

const pickTemplate = (configured: unknown, override?: ReportCardTemplate): ReportCardTemplate =>
  override ?? (configured === 'cbse' ? 'cbse' : 'generic');

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

  // ── Grade calc + class rank → report cards (P2-MOD-17) ──────
  r.post(
    '/exams/:id/compute',
    { config: manage, schema: { tags: ['exams'], params: idParamSchema } },
    async (request) => {
      const result = await request.tenantDb(async (db) => {
        const [exam] = await db
          .select()
          .from(exams)
          .where(eq(exams.id, request.params.id))
          .limit(1);
        assertFound(exam, 'Exam');
        let scale: GradingScale = [];
        if (exam.gradingSystemId) {
          const [gs] = await db
            .select()
            .from(gradingSystems)
            .where(eq(gradingSystems.id, exam.gradingSystemId))
            .limit(1);
          scale = (gs?.scale ?? []) as GradingScale;
        }

        const rows = await db
          .select({
            studentId: examResults.studentId,
            marks: examResults.marksObtained,
            isAbsent: examResults.isAbsent,
            isExempt: examResults.isExempt,
            subjectId: examSubjects.subjectId,
            subjectMax: examSubjects.maxMarks,
          })
          .from(examResults)
          .innerJoin(examSubjects, eq(examSubjects.id, examResults.examSubjectId))
          .where(eq(examResults.examId, exam.id));

        // Aggregate per student: exempt subjects drop out of both totals;
        // absent counts as 0 obtained but still against the max.
        type Agg = {
          obtained: number;
          max: number;
          subjects: Array<Record<string, unknown>>;
        };
        const byStudent = new Map<string, Agg>();
        for (const row of rows) {
          const agg = byStudent.get(row.studentId) ?? { obtained: 0, max: 0, subjects: [] };
          if (!row.isExempt) {
            agg.obtained += row.isAbsent ? 0 : (row.marks ?? 0);
            agg.max += row.subjectMax;
          }
          agg.subjects.push({
            subjectId: row.subjectId,
            marks: row.marks,
            maxMarks: row.subjectMax,
            isAbsent: row.isAbsent,
            isExempt: row.isExempt,
          });
          byStudent.set(row.studentId, agg);
        }

        // Percentages then standard competition ranking (ties share a rank).
        const computed = [...byStudent.entries()].map(([studentId, a]) => ({
          studentId,
          totalMarks: a.obtained,
          maxMarks: a.max,
          percentageBp: a.max > 0 ? Math.round((a.obtained / a.max) * 10000) : 0,
          grade:
            a.max > 0
              ? (gradeForPercentage(scale, (a.obtained / a.max) * 100)?.grade ?? null)
              : null,
          subjects: a.subjects,
        }));
        computed.sort((x, y) => y.percentageBp - x.percentageBp);
        let rank = 0;
        let prevBp: number | null = null;
        computed.forEach((c, i) => {
          if (c.percentageBp !== prevBp) {
            rank = i + 1;
            prevBp = c.percentageBp;
          }
          (c as typeof c & { rank: number }).rank = rank;
        });

        for (const c of computed as Array<(typeof computed)[number] & { rank: number }>) {
          await db
            .insert(reportCards)
            .values({
              tenantId: request.tenant!.id,
              examId: exam.id,
              studentId: c.studentId,
              data: { subjects: c.subjects },
              totalMarks: c.totalMarks,
              maxMarks: c.maxMarks,
              percentageBp: c.percentageBp,
              grade: c.grade,
              rank: c.rank,
            })
            .onConflictDoUpdate({
              target: [reportCards.tenantId, reportCards.examId, reportCards.studentId],
              set: {
                data: { subjects: c.subjects },
                totalMarks: c.totalMarks,
                maxMarks: c.maxMarks,
                percentageBp: c.percentageBp,
                grade: c.grade,
                rank: c.rank,
              },
            });
        }
        await writeAudit(db, request.auth!, {
          action: 'create',
          entityType: 'exam_results_computed',
          entityId: exam.id,
          newValues: { students: computed.length },
        });
        return { students: computed.length };
      });
      return { success: true as const, data: result };
    },
  );

  // ── Academic analytics (P2-MOD-22) ─────────────────────────
  r.get(
    '/exams/:id/analytics',
    { config: view, schema: { tags: ['exams'], params: idParamSchema } },
    async (request) => {
      const examId = request.params.id;
      const N = (v: unknown) => (v == null ? null : Number(v));
      const data = await request.tenantDb(async (db) => {
        const subjectStats = (
          await db.execute(sql`
            SELECT su.name AS "subject", es.pass_marks AS "passMarks",
              COUNT(er.id) FILTER (WHERE NOT er.is_exempt) AS "count",
              COALESCE(AVG(CASE WHEN er.is_absent THEN 0 ELSE er.marks_obtained END)
                FILTER (WHERE NOT er.is_exempt), 0) AS "average",
              MAX(CASE WHEN er.is_absent THEN 0 ELSE er.marks_obtained END)
                FILTER (WHERE NOT er.is_exempt) AS "highest",
              MIN(CASE WHEN er.is_absent THEN 0 ELSE er.marks_obtained END)
                FILTER (WHERE NOT er.is_exempt) AS "lowest",
              COUNT(*) FILTER (WHERE NOT er.is_exempt AND NOT er.is_absent
                AND er.marks_obtained >= es.pass_marks) AS "passCount"
            FROM exam_subjects es
            JOIN subjects su ON su.id = es.subject_id
            LEFT JOIN exam_results er ON er.exam_subject_id = es.id
            WHERE es.exam_id = ${examId}
            GROUP BY su.name, es.pass_marks
            ORDER BY su.name
          `)
        ).rows as Array<Record<string, unknown>>;

        const distribution = (
          await db.execute(sql`
            SELECT grade, COUNT(*) AS "count" FROM report_cards
            WHERE exam_id = ${examId} AND grade IS NOT NULL
            GROUP BY grade ORDER BY grade
          `)
        ).rows as Array<{ grade: string; count: string }>;

        const overall = (
          await db.execute(sql`
            SELECT COUNT(*) AS "students",
                   COALESCE(AVG(percentage_bp), 0) / 100 AS "averagePercentage"
            FROM report_cards WHERE exam_id = ${examId}
          `)
        ).rows[0] as { students: string; averagePercentage: string };

        const passedAll = (
          await db.execute(sql`
            SELECT COUNT(*) AS "n" FROM (
              SELECT er.student_id
              FROM exam_results er JOIN exam_subjects es ON es.id = er.exam_subject_id
              WHERE er.exam_id = ${examId} AND NOT er.is_exempt
              GROUP BY er.student_id
              HAVING BOOL_AND(NOT er.is_absent AND er.marks_obtained >= es.pass_marks)
            ) t
          `)
        ).rows[0] as { n: string };

        const students = N(overall.students) ?? 0;
        const passCount = N(passedAll.n) ?? 0;
        return {
          subjectStats: subjectStats.map((s) => ({
            subject: s.subject,
            count: N(s.count),
            average: N(s.average) == null ? null : Math.round((N(s.average) as number) * 10) / 10,
            highest: N(s.highest),
            lowest: N(s.lowest),
            passCount: N(s.passCount),
            passPercent:
              N(s.count) && (N(s.count) as number) > 0
                ? Math.round(((N(s.passCount) as number) / (N(s.count) as number)) * 1000) / 10
                : 0,
          })),
          gradeDistribution: distribution.map((d) => ({ grade: d.grade, count: N(d.count) })),
          overall: {
            students,
            averagePercentage: Math.round(N(overall.averagePercentage)! * 10) / 10,
            passCount,
            passPercent: students > 0 ? Math.round((passCount / students) * 1000) / 10 : 0,
          },
        };
      });
      return { success: true as const, data };
    },
  );

  // ── Result publishing: controlled release (P2-MOD-21) ───────
  r.post(
    '/exams/:id/publish',
    { config: manage, schema: { tags: ['exams'], params: idParamSchema } },
    async (request) => {
      const result = await request.tenantDb(async (db) => {
        const [exam] = await db
          .select()
          .from(exams)
          .where(eq(exams.id, request.params.id))
          .limit(1);
        assertFound(exam, 'Exam');
        // Pre-generation guard: results must be computed before release.
        const countRows = await db
          .select({ n: count() })
          .from(reportCards)
          .where(eq(reportCards.examId, exam.id));
        const n = countRows[0]?.n ?? 0;
        if (n === 0) {
          throw new AppError(ErrorCodes.CONFLICT, 'Compute results before publishing', 409);
        }
        const now = new Date();
        await db
          .update(exams)
          .set({ status: 'published', publishedAt: now, updatedAt: now })
          .where(eq(exams.id, exam.id));
        await db
          .update(reportCards)
          .set({ publishedAt: now })
          .where(eq(reportCards.examId, exam.id));
        await emitEvent(db, {
          tenantId: request.tenant!.id,
          type: EVENT_TYPES.EXAM_RESULTS_PUBLISHED,
          aggregateType: 'exam',
          aggregateId: exam.id,
          payload: { examId: exam.id, name: exam.name, reportCards: n },
        });
        await writeAudit(db, request.auth!, {
          action: 'update',
          entityType: 'exam',
          entityId: exam.id,
          newValues: { status: 'published', publishedCards: n },
        });
        return { published: n };
      });
      return { success: true as const, data: result };
    },
  );

  r.post(
    '/exams/:id/unpublish',
    { config: manage, schema: { tags: ['exams'], params: idParamSchema } },
    async (request) => {
      await request.tenantDb(async (db) => {
        const [exam] = await db
          .select()
          .from(exams)
          .where(eq(exams.id, request.params.id))
          .limit(1);
        assertFound(exam, 'Exam');
        await db
          .update(exams)
          .set({ status: 'completed', publishedAt: null, updatedAt: new Date() })
          .where(eq(exams.id, exam.id));
        await db
          .update(reportCards)
          .set({ publishedAt: null })
          .where(eq(reportCards.examId, exam.id));
        await writeAudit(db, request.auth!, {
          action: 'update',
          entityType: 'exam',
          entityId: exam.id,
          newValues: { status: 'completed', unpublished: true },
        });
      });
      return { success: true as const, data: { unpublished: true } };
    },
  );

  // A student's PUBLISHED report cards only (portal-safe controlled release).
  r.get(
    '/students/:id/report-cards',
    { config: { permission: true }, schema: { tags: ['exams'], params: idParamSchema } },
    async (request) => {
      const rows = await request.tenantDb((db) =>
        db
          .select({
            examId: reportCards.examId,
            examName: exams.name,
            totalMarks: reportCards.totalMarks,
            maxMarks: reportCards.maxMarks,
            percentageBp: reportCards.percentageBp,
            grade: reportCards.grade,
            rank: reportCards.rank,
            publishedAt: reportCards.publishedAt,
          })
          .from(reportCards)
          .innerJoin(exams, eq(exams.id, reportCards.examId))
          .where(
            and(eq(reportCards.studentId, request.params.id), isNotNull(reportCards.publishedAt)),
          ),
      );
      return {
        success: true as const,
        data: rows.map((r2) => ({
          examId: r2.examId,
          examName: r2.examName,
          totalMarks: r2.totalMarks,
          maxMarks: r2.maxMarks,
          percentage: r2.percentageBp == null ? null : r2.percentageBp / 100,
          grade: r2.grade,
          rank: r2.rank,
        })),
      };
    },
  );

  r.get(
    '/exams/:id/report-cards',
    { config: view, schema: { tags: ['exams'], params: idParamSchema } },
    async (request) => {
      const rows = await request.tenantDb((db) =>
        db
          .select({
            studentId: reportCards.studentId,
            firstName: students.firstName,
            lastName: students.lastName,
            totalMarks: reportCards.totalMarks,
            maxMarks: reportCards.maxMarks,
            percentageBp: reportCards.percentageBp,
            grade: reportCards.grade,
            rank: reportCards.rank,
          })
          .from(reportCards)
          .innerJoin(students, eq(students.id, reportCards.studentId))
          .where(eq(reportCards.examId, request.params.id))
          .orderBy(asc(reportCards.rank)),
      );
      return {
        success: true as const,
        data: rows.map((r2) => ({
          studentId: r2.studentId,
          name: [r2.firstName, r2.lastName].filter(Boolean).join(' '),
          totalMarks: r2.totalMarks,
          maxMarks: r2.maxMarks,
          percentage: r2.percentageBp == null ? null : r2.percentageBp / 100,
          grade: r2.grade,
          rank: r2.rank,
        })),
      };
    },
  );

  // ── Report-card PDF (P2-MOD-18/19): render one student's card to A4 PDF ──
  r.get(
    '/exams/:id/students/:studentId/report-card.pdf',
    {
      config: view,
      schema: {
        tags: ['exams'],
        params: z.object({ id: z.string().uuid(), studentId: z.string().uuid() }),
        querystring: z.object({ template: z.enum(['generic', 'cbse']).optional() }),
      },
    },
    async (request, reply) => {
      const { id: examId, studentId } = request.params;
      const assembled = await request.tenantDb((db) =>
        assembleReportCards(db, request.tenant!.name, examId, { studentId }),
      );
      const card = assembled.cards[0];
      assertFound(card, 'Report card');

      const template = pickTemplate(
        request.tenant!.config?.reportCardTemplate,
        request.query.template,
      );
      let pdf: Buffer;
      try {
        pdf = await htmlToPdf(renderReportCardHtml(card.data, template));
      } catch {
        throw new AppError(
          ErrorCodes.INTERNAL_ERROR,
          'PDF rendering is unavailable (Chrome could not be launched)',
          503,
        );
      }
      return reply
        .header('content-type', 'application/pdf')
        .header('content-disposition', 'inline; filename="report-card.pdf"')
        .send(pdf);
    },
  );

  // ── Bulk report generation (P2-MOD-20): pre-render published cards to S3 ──
  // Synchronous for now (loops htmlToPdf); moving this to the outbox worker is
  // a future optimization once PDF rendering is extracted into a shared package.
  r.post(
    '/exams/:id/report-cards/generate',
    {
      config: manage,
      schema: {
        tags: ['exams'],
        params: idParamSchema,
        querystring: z.object({ template: z.enum(['generic', 'cbse']).optional() }),
      },
    },
    async (request) => {
      const examId = request.params.id;
      const tenantId = request.tenant!.id;
      const template = pickTemplate(
        request.tenant!.config?.reportCardTemplate,
        request.query.template,
      );

      // Only published cards are cached — this warms the result-day cache.
      const assembled = await request.tenantDb((db) =>
        assembleReportCards(db, request.tenant!.name, examId, { publishedOnly: true }),
      );
      if (assembled.cards.length === 0) {
        throw new AppError(
          ErrorCodes.CONFLICT,
          'No published report cards to generate — publish results first',
          409,
        );
      }

      let pdf0: Buffer;
      try {
        pdf0 = await htmlToPdf(renderReportCardHtml(assembled.cards[0]!.data, template));
      } catch {
        throw new AppError(
          ErrorCodes.INTERNAL_ERROR,
          'PDF rendering is unavailable (Chrome could not be launched)',
          503,
        );
      }
      const manifest: Array<{ studentId: string; key: string }> = [];
      const first = assembled.cards[0]!;
      const key0 = reportCardKey(tenantId, examId, first.studentId);
      await putObject(key0, pdf0, 'application/pdf');
      manifest.push({ studentId: first.studentId, key: key0 });

      for (const c of assembled.cards.slice(1)) {
        const pdf = await htmlToPdf(renderReportCardHtml(c.data, template));
        const key = reportCardKey(tenantId, examId, c.studentId);
        await putObject(key, pdf, 'application/pdf');
        manifest.push({ studentId: c.studentId, key });
      }

      // Batch notify + audit in one tenant transaction.
      await request.tenantDb(async (db) => {
        await writeAudit(db, request.auth!, {
          action: 'export',
          entityType: 'report_cards_batch',
          entityId: examId,
          newValues: { generated: manifest.length, template },
        });
        await emitEvent(db, {
          tenantId,
          type: EVENT_TYPES.REPORT_CARDS_GENERATED,
          aggregateType: 'exam',
          aggregateId: examId,
          payload: {
            examId,
            generated: manifest.length,
            students: manifest.map((m) => m.studentId),
          },
        });
      });

      return {
        success: true as const,
        data: { generated: manifest.length, template, cards: manifest },
      };
    },
  );
}
