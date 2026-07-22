import {
  attendanceSettings,
  emitEvent,
  parents,
  parentStudent,
  studentAttendance,
  students,
} from '@schoolmate/db';
import { EVENT_TYPES } from '@schoolmate/shared';
import { and, between, count, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { writeAudit } from '../../lib/audit.js';

const statusEnum = z.enum(['present', 'absent', 'late', 'half_day', 'excused', 'holiday']);

const markSchema = z.object({
  branchId: z.string().uuid(),
  classId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  academicSessionId: z.string().uuid().optional(),
  date: z.string().date(),
  source: z.enum(['manual', 'biometric', 'app', 'qr', 'rfid']).optional(),
  entries: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        status: statusEnum,
        remarks: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(200),
});

export async function attendanceRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // ── Mark attendance for a class/section (P1-MOD-23) ────────
  r.post(
    '/attendance/mark',
    {
      config: { permission: 'attendance.mark' },
      schema: { tags: ['attendance'], body: markSchema },
    },
    async (request) => {
      const { branchId, classId, sectionId, academicSessionId, date, source, entries } =
        request.body;

      const result = await request.tenantDb(async (db) => {
        // Upsert one row per student per day (idempotent re-marking).
        for (const e of entries) {
          await db
            .insert(studentAttendance)
            .values({
              tenantId: request.tenant!.id,
              branchId,
              studentId: e.studentId,
              classId: classId ?? null,
              sectionId: sectionId ?? null,
              academicSessionId: academicSessionId ?? null,
              date,
              status: e.status,
              source: source ?? 'manual',
              markedBy: request.auth!.userId,
              remarks: e.remarks ?? null,
            })
            .onConflictDoUpdate({
              target: [
                studentAttendance.tenantId,
                studentAttendance.studentId,
                studentAttendance.date,
              ],
              set: {
                status: e.status,
                markedBy: request.auth!.userId,
                markedAt: new Date(),
                remarks: e.remarks ?? null,
              },
            });
        }

        await writeAudit(db, request.auth!, {
          action: 'create',
          entityType: 'attendance',
          entityId: `${sectionId ?? branchId}:${date}`,
          newValues: { date, count: entries.length },
        });

        // Absent flow (P1-API-03): notify each parent via the engine.
        const absentIds = entries.filter((e) => e.status === 'absent').map((e) => e.studentId);
        let notified = 0;
        if (absentIds.length > 0) {
          const [settings] = await db
            .select()
            .from(attendanceSettings)
            .where(eq(attendanceSettings.branchId, branchId))
            .limit(1);
          const autoNotify = settings?.autoNotifyParentOnAbsent ?? true;

          if (autoNotify) {
            const absentStudents = await db
              .select({
                id: students.id,
                firstName: students.firstName,
                lastName: students.lastName,
              })
              .from(students)
              .where(inArray(students.id, absentIds));
            const nameById = new Map(
              absentStudents.map((s) => [
                s.id,
                [s.firstName, s.lastName].filter(Boolean).join(' '),
              ]),
            );

            const links = await db
              .select({
                studentId: parentStudent.studentId,
                userId: parents.userId,
                phone: parents.phone,
              })
              .from(parentStudent)
              .innerJoin(parents, eq(parents.id, parentStudent.parentId))
              .where(inArray(parentStudent.studentId, absentIds));

            const byStudent = new Map<
              string,
              Array<{ userId?: string | undefined; phone?: string | undefined }>
            >();
            for (const l of links) {
              const arr = byStudent.get(l.studentId) ?? [];
              arr.push({ userId: l.userId ?? undefined, phone: l.phone ?? undefined });
              byStudent.set(l.studentId, arr);
            }

            for (const studentId of absentIds) {
              const recipients = byStudent.get(studentId) ?? [];
              if (recipients.length === 0) continue;
              await emitEvent(db, {
                tenantId: request.tenant!.id,
                type: EVENT_TYPES.ATTENDANCE_ABSENT,
                aggregateType: 'student',
                aggregateId: studentId,
                payload: {
                  studentId,
                  studentName: nameById.get(studentId) ?? 'Your child',
                  date,
                  recipients,
                },
              });
              notified += 1;
            }
            // Flag the rows whose parents were notified.
            await db
              .update(studentAttendance)
              .set({ parentNotified: true })
              .where(
                and(
                  eq(studentAttendance.date, date),
                  inArray(studentAttendance.studentId, absentIds),
                ),
              );
          }
        }

        return { marked: entries.length, absent: absentIds.length, notified };
      });

      return { success: true as const, data: result };
    },
  );

  // ── Daily register for a section (P1-MOD-25) ───────────────
  r.get(
    '/attendance/daily',
    {
      config: { permission: 'attendance.view' },
      schema: {
        tags: ['attendance'],
        querystring: z.object({
          date: z.string().date(),
          sectionId: z.string().uuid().optional(),
          classId: z.string().uuid().optional(),
          branchId: z.string().uuid().optional(),
        }),
      },
    },
    async (request) => {
      const { date, sectionId, classId, branchId } = request.query;
      const filters = [
        eq(studentAttendance.date, date),
        sectionId ? eq(studentAttendance.sectionId, sectionId) : undefined,
        classId ? eq(studentAttendance.classId, classId) : undefined,
        branchId ? eq(studentAttendance.branchId, branchId) : undefined,
      ].filter((f): f is NonNullable<typeof f> => f !== undefined);

      const rows = await request.tenantDb((db) =>
        db
          .select({
            id: studentAttendance.id,
            studentId: studentAttendance.studentId,
            studentName: students.firstName,
            status: studentAttendance.status,
            remarks: studentAttendance.remarks,
            parentNotified: studentAttendance.parentNotified,
          })
          .from(studentAttendance)
          .innerJoin(students, eq(students.id, studentAttendance.studentId))
          .where(and(...filters))
          .orderBy(students.firstName),
      );
      return { success: true as const, data: rows };
    },
  );

  // ── Per-student attendance report / % (P1-MOD-25) ──────────
  r.get(
    '/attendance/students/:id/report',
    {
      config: { permission: 'attendance.view' },
      schema: {
        tags: ['attendance'],
        params: z.object({ id: z.string().uuid() }),
        querystring: z.object({ from: z.string().date(), to: z.string().date() }),
      },
    },
    async (request) => {
      const { id } = request.params;
      const { from, to } = request.query;
      const rows = await request.tenantDb((db) =>
        db
          .select({ status: studentAttendance.status, n: count() })
          .from(studentAttendance)
          .where(
            and(eq(studentAttendance.studentId, id), between(studentAttendance.date, from, to)),
          )
          .groupBy(studentAttendance.status),
      );

      const counts: Record<string, number> = {};
      for (const row of rows) counts[row.status] = row.n;
      const working =
        (counts.present ?? 0) +
        (counts.absent ?? 0) +
        (counts.late ?? 0) +
        (counts.half_day ?? 0) +
        (counts.excused ?? 0);
      const attended = (counts.present ?? 0) + (counts.late ?? 0) + 0.5 * (counts.half_day ?? 0);
      const percentage = working === 0 ? 0 : Math.round((attended / working) * 1000) / 10;

      return {
        success: true as const,
        data: { studentId: id, from, to, counts, workingDays: working, percentage },
      };
    },
  );

  // ── Attendance settings per branch (P1-MOD-22) ─────────────
  r.get(
    '/attendance/settings',
    {
      config: { permission: 'attendance.view' },
      schema: {
        tags: ['attendance'],
        querystring: z.object({ branchId: z.string().uuid() }),
      },
    },
    async (request) => {
      const [row] = await request.tenantDb((db) =>
        db
          .select()
          .from(attendanceSettings)
          .where(eq(attendanceSettings.branchId, request.query.branchId))
          .limit(1),
      );
      return {
        success: true as const,
        data: row ?? {
          branchId: request.query.branchId,
          attendanceType: 'daily',
          autoNotifyParentOnAbsent: true,
          notifyAfterConsecutiveAbsents: 3,
          minimumAttendancePercentage: 75,
          lateThresholdMinutes: 15,
          isDefault: true,
        },
      };
    },
  );

  r.patch(
    '/attendance/settings',
    {
      config: { permission: 'attendance.manage' },
      schema: {
        tags: ['attendance'],
        body: z.object({
          branchId: z.string().uuid(),
          attendanceType: z.enum(['daily', 'period_wise']).optional(),
          autoNotifyParentOnAbsent: z.boolean().optional(),
          notifyAfterConsecutiveAbsents: z.number().int().min(1).max(30).optional(),
          minimumAttendancePercentage: z.number().int().min(0).max(100).optional(),
          lateThresholdMinutes: z.number().int().min(0).max(120).optional(),
        }),
      },
    },
    async (request) => {
      const { branchId, ...rest } = request.body;
      const saved = await request.tenantDb(async (db) => {
        const [row] = await db
          .insert(attendanceSettings)
          .values({ tenantId: request.tenant!.id, branchId, ...rest })
          .onConflictDoUpdate({
            target: [attendanceSettings.tenantId, attendanceSettings.branchId],
            set: { ...rest, updatedAt: new Date() },
          })
          .returning();
        return row!;
      });
      return { success: true as const, data: saved };
    },
  );
}
