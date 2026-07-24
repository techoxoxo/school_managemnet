/**
 * P1-WEB-01/02 support: one aggregate call that powers both the admin and
 * teacher dashboards. Everything is tenant-scoped (RLS); the `me` block is
 * populated only when the caller has a linked staff record.
 */
import {
  admissions,
  classes,
  sections,
  staffMembers,
  studentAttendance,
  students,
  subjectTeachers,
} from '@schoolmate/db';
import { and, count, eq, notInArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function dashboardRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/dashboard/summary',
    {
      config: { permission: true },
      schema: {
        tags: ['dashboard'],
        querystring: z.object({ branchId: z.string().uuid().optional() }),
      },
    },
    async (request) => {
      const { branchId } = request.query;
      const date = today();

      const data = await request.tenantDb(async (db) => {
        const [[studentCount], [staffCount], [openAdmissions], attnRows] = await Promise.all([
          db
            .select({ n: count() })
            .from(students)
            .where(
              and(
                eq(students.status, 'active'),
                branchId ? eq(students.branchId, branchId) : undefined,
              ),
            ),
          db
            .select({ n: count() })
            .from(staffMembers)
            .where(
              and(
                eq(staffMembers.status, 'active'),
                branchId ? eq(staffMembers.branchId, branchId) : undefined,
              ),
            ),
          db
            .select({ n: count() })
            .from(admissions)
            .where(
              and(
                notInArray(admissions.status, ['enrolled', 'rejected', 'withdrawn']),
                branchId ? eq(admissions.branchId, branchId) : undefined,
              ),
            ),
          db
            .select({ status: studentAttendance.status, n: count() })
            .from(studentAttendance)
            .where(
              and(
                eq(studentAttendance.date, date),
                branchId ? eq(studentAttendance.branchId, branchId) : undefined,
              ),
            )
            .groupBy(studentAttendance.status),
        ]);

        const attn: Record<string, number> = {};
        for (const row of attnRows) attn[row.status] = row.n;
        const attendanceToday = {
          date,
          present: attn.present ?? 0,
          absent: attn.absent ?? 0,
          late: attn.late ?? 0,
          marked: attnRows.reduce((sum, row) => sum + row.n, 0),
        };

        // Teacher block: resolve the caller's own staff record.
        const [staff] = await db
          .select({ id: staffMembers.id })
          .from(staffMembers)
          .where(eq(staffMembers.userId, request.auth!.userId))
          .limit(1);

        let me: {
          staffId: string;
          myClasses: Array<{ sectionId: string; sectionName: string; className: string }>;
          subjectsTaught: number;
        } | null = null;

        if (staff) {
          const myClasses = await db
            .select({
              sectionId: sections.id,
              sectionName: sections.name,
              className: classes.name,
            })
            .from(sections)
            .innerJoin(classes, eq(classes.id, sections.classId))
            .where(eq(sections.classTeacherId, staff.id));
          const [subjects] = await db
            .select({ n: count() })
            .from(subjectTeachers)
            .where(eq(subjectTeachers.staffId, staff.id));
          me = { staffId: staff.id, myClasses, subjectsTaught: subjects?.n ?? 0 };
        }

        return {
          counts: {
            students: studentCount?.n ?? 0,
            staff: staffCount?.n ?? 0,
            openAdmissions: openAdmissions?.n ?? 0,
          },
          attendanceToday,
          me,
        };
      });

      return { success: true as const, data };
    },
  );
}
