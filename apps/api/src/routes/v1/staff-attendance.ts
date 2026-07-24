/**
 * P1-MOD-27: staff attendance — manual (admin) marking + self check-in/out.
 * Mirrors the student-attendance module (P1-MOD-23). One row per staff per
 * day (upsert), audited writes, RLS-scoped. Self check-in resolves the
 * caller's own staff record via userId, so a staff member can only mark
 * themselves regardless of role.
 */
import { staffAttendance, staffMembers } from '@schoolmate/db';
import { and, between, count, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError, ErrorCodes } from '@schoolmate/shared';
import { writeAudit } from '../../lib/audit.js';

const statusEnum = z.enum([
  'present',
  'absent',
  'half_day',
  'late',
  'on_leave',
  'holiday',
  'weekend',
]);
const sourceEnum = z.enum(['manual', 'biometric', 'app', 'qr', 'rfid']);
const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'expected HH:MM[:SS]');

/** Today as YYYY-MM-DD in server local time. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
/** Current wall-clock as HH:MM:SS in server local time. */
function nowTime(): string {
  return new Date().toTimeString().slice(0, 8);
}

export async function staffAttendanceRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // ── Admin: bulk-mark staff attendance for a day ────────────
  const markSchema = z.object({
    branchId: z.string().uuid(),
    date: z.string().date(),
    source: sourceEnum.optional(),
    entries: z
      .array(
        z.object({
          staffId: z.string().uuid(),
          status: statusEnum,
          checkInTime: timeString.optional(),
          checkOutTime: timeString.optional(),
          remarks: z.string().max(200).optional(),
        }),
      )
      .min(1)
      .max(500),
  });

  r.post(
    '/staff-attendance/mark',
    { config: { permission: 'staff.manage' }, schema: { tags: ['staff'], body: markSchema } },
    async (request) => {
      const { branchId, date, source, entries } = request.body;
      const result = await request.tenantDb(async (db) => {
        for (const e of entries) {
          await db
            .insert(staffAttendance)
            .values({
              tenantId: request.tenant!.id,
              branchId,
              staffId: e.staffId,
              date,
              status: e.status,
              checkInTime: e.checkInTime ?? null,
              checkOutTime: e.checkOutTime ?? null,
              source: source ?? 'manual',
              markedBy: request.auth!.userId,
              remarks: e.remarks ?? null,
            })
            .onConflictDoUpdate({
              target: [staffAttendance.tenantId, staffAttendance.staffId, staffAttendance.date],
              set: {
                status: e.status,
                checkInTime: e.checkInTime ?? null,
                checkOutTime: e.checkOutTime ?? null,
                markedBy: request.auth!.userId,
                remarks: e.remarks ?? null,
              },
            });
        }
        await writeAudit(db, request.auth!, {
          action: 'create',
          entityType: 'staff_attendance',
          entityId: `${branchId}:${date}`,
          newValues: { date, count: entries.length },
        });
        return { marked: entries.length };
      });
      return { success: true as const, data: result };
    },
  );

  /** Resolve the caller's own staff record (RLS-scoped) or 403. */
  async function requireOwnStaff(request: FastifyRequest) {
    const [staff] = await request.tenantDb((db) =>
      db
        .select({ id: staffMembers.id, branchId: staffMembers.branchId })
        .from(staffMembers)
        .where(eq(staffMembers.userId, request.auth!.userId))
        .limit(1),
    );
    if (!staff) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'No staff record linked to your account', 403);
    }
    return staff;
  }

  // ── Self check-in (any authenticated staff) ────────────────
  r.post(
    '/staff-attendance/check-in',
    {
      config: { permission: true },
      schema: {
        tags: ['staff'],
        body: z.object({
          date: z.string().date().optional(),
          checkInTime: timeString.optional(),
          source: sourceEnum.optional(),
          remarks: z.string().max(200).optional(),
        }),
      },
    },
    async (request) => {
      const staff = await requireOwnStaff(request);
      const date = request.body.date ?? today();
      const checkInTime = request.body.checkInTime ?? nowTime();
      const row = await request.tenantDb(async (db) => {
        const [saved] = await db
          .insert(staffAttendance)
          .values({
            tenantId: request.tenant!.id,
            branchId: staff.branchId,
            staffId: staff.id,
            date,
            status: 'present',
            checkInTime,
            source: request.body.source ?? 'app',
            markedBy: request.auth!.userId,
            remarks: request.body.remarks ?? null,
          })
          .onConflictDoUpdate({
            target: [staffAttendance.tenantId, staffAttendance.staffId, staffAttendance.date],
            set: { checkInTime, status: 'present' },
          })
          .returning();
        return saved!;
      });
      return { success: true as const, data: row };
    },
  );

  // ── Self check-out ─────────────────────────────────────────
  r.post(
    '/staff-attendance/check-out',
    {
      config: { permission: true },
      schema: {
        tags: ['staff'],
        body: z.object({
          date: z.string().date().optional(),
          checkOutTime: timeString.optional(),
        }),
      },
    },
    async (request) => {
      const staff = await requireOwnStaff(request);
      const date = request.body.date ?? today();
      const checkOutTime = request.body.checkOutTime ?? nowTime();
      const row = await request.tenantDb(async (db) => {
        const [existing] = await db
          .select({ id: staffAttendance.id })
          .from(staffAttendance)
          .where(and(eq(staffAttendance.staffId, staff.id), eq(staffAttendance.date, date)))
          .limit(1);
        if (!existing) {
          throw new AppError(ErrorCodes.NOT_FOUND, 'Check in before checking out', 404);
        }
        const [saved] = await db
          .update(staffAttendance)
          .set({ checkOutTime })
          .where(eq(staffAttendance.id, existing.id))
          .returning();
        return saved!;
      });
      return { success: true as const, data: row };
    },
  );

  // ── Daily register for a branch ────────────────────────────
  r.get(
    '/staff-attendance/daily',
    {
      config: { permission: 'staff.view' },
      schema: {
        tags: ['staff'],
        querystring: z.object({
          date: z.string().date(),
          branchId: z.string().uuid().optional(),
        }),
      },
    },
    async (request) => {
      const { date, branchId } = request.query;
      const filters = [
        eq(staffAttendance.date, date),
        branchId ? eq(staffAttendance.branchId, branchId) : undefined,
      ].filter((f): f is NonNullable<typeof f> => f !== undefined);

      const rows = await request.tenantDb((db) =>
        db
          .select({
            id: staffAttendance.id,
            staffId: staffAttendance.staffId,
            firstName: staffMembers.firstName,
            lastName: staffMembers.lastName,
            employeeId: staffMembers.employeeId,
            status: staffAttendance.status,
            checkInTime: staffAttendance.checkInTime,
            checkOutTime: staffAttendance.checkOutTime,
            remarks: staffAttendance.remarks,
          })
          .from(staffAttendance)
          .innerJoin(staffMembers, eq(staffMembers.id, staffAttendance.staffId))
          .where(and(...filters))
          .orderBy(staffMembers.firstName),
      );
      return { success: true as const, data: rows };
    },
  );

  // ── Per-staff summary over a date range ────────────────────
  r.get(
    '/staff-attendance/staff/:id/report',
    {
      config: { permission: 'staff.view' },
      schema: {
        tags: ['staff'],
        params: z.object({ id: z.string().uuid() }),
        querystring: z.object({ from: z.string().date(), to: z.string().date() }),
      },
    },
    async (request) => {
      const { id } = request.params;
      const { from, to } = request.query;
      const rows = await request.tenantDb((db) =>
        db
          .select({ status: staffAttendance.status, n: count() })
          .from(staffAttendance)
          .where(and(eq(staffAttendance.staffId, id), between(staffAttendance.date, from, to)))
          .groupBy(staffAttendance.status),
      );
      const counts: Record<string, number> = {};
      for (const row of rows) counts[row.status] = row.n;
      const marked =
        (counts.present ?? 0) +
        (counts.absent ?? 0) +
        (counts.late ?? 0) +
        (counts.half_day ?? 0) +
        (counts.on_leave ?? 0);
      const attended = (counts.present ?? 0) + (counts.late ?? 0) + 0.5 * (counts.half_day ?? 0);
      const percentage = marked === 0 ? 0 : Math.round((attended / marked) * 1000) / 10;
      return {
        success: true as const,
        data: { staffId: id, from, to, counts, markedDays: marked, percentage },
      };
    },
  );
}
