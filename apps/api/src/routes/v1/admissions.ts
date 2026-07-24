/**
 * P1-MOD-12: admission pipeline. An application moves through a status
 * workflow (applied → … → accepted) and is then converted into a student.
 * Tenant-scoped (RLS), audited, guarded by the student permissions
 * (receptionists already hold student.*).
 */
import { admissions, emitEvent, students } from '@schoolmate/db';
import { AppError, ErrorCodes, EVENT_TYPES } from '@schoolmate/shared';
import { and, count, eq, ilike } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { writeAudit } from '../../lib/audit.js';
import { assertFound, idParamSchema, listQuerySchema, paginationMeta } from '../../lib/http.js';

type AdmissionRow = typeof admissions.$inferSelect;
type AdmissionStatus = AdmissionRow['status'];

/** Allowed status transitions; `enrolled` is reachable only via /convert. */
const TRANSITIONS: Record<AdmissionStatus, AdmissionStatus[]> = {
  applied: ['under_review', 'rejected', 'withdrawn'],
  under_review: ['shortlisted', 'rejected', 'withdrawn'],
  shortlisted: ['interview', 'offered', 'rejected', 'withdrawn'],
  interview: ['offered', 'rejected', 'withdrawn'],
  offered: ['accepted', 'rejected', 'withdrawn'],
  accepted: ['withdrawn'],
  rejected: [],
  withdrawn: [],
  enrolled: [],
};

export async function admissionRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const view = { permission: 'student.view' };
  const manage = { permission: 'student.manage' };

  const createSchema = z.object({
    branchId: z.string().uuid(),
    applicationNumber: z.string().min(1).max(50),
    applicantFirstName: z.string().min(1).max(100),
    applicantLastName: z.string().max(100).optional(),
    dateOfBirth: z.string().date().optional(),
    gender: z.enum(['male', 'female', 'other']).optional(),
    classAppliedFor: z.string().uuid().optional(),
    academicSessionId: z.string().uuid().optional(),
    guardianName: z.string().max(160).optional(),
    guardianPhone: z.string().max(30).optional(),
    guardianEmail: z.string().email().optional(),
    previousSchoolName: z.string().max(200).optional(),
    notes: z.string().max(1000).optional(),
  });

  r.post(
    '/admissions',
    { config: manage, schema: { tags: ['admissions'], body: createSchema } },
    async (request, reply) => {
      const created = await request.tenantDb(async (db) => {
        const [row] = await db
          .insert(admissions)
          .values({ ...request.body, tenantId: request.tenant!.id })
          .returning();
        await writeAudit(db, request.auth!, {
          action: 'create',
          entityType: 'admission',
          entityId: row!.id,
          newValues: row,
        });
        return row!;
      });
      return reply.status(201).send({ success: true as const, data: created });
    },
  );

  const listQuery = listQuerySchema.extend({
    branchId: z.string().uuid().optional(),
    status: z.string().optional(),
  });

  r.get(
    '/admissions',
    { config: view, schema: { tags: ['admissions'], querystring: listQuery } },
    async (request) => {
      const { page, limit, q, branchId, status } = request.query;
      const filters = [
        q ? ilike(admissions.applicantFirstName, `%${q}%`) : undefined,
        branchId ? eq(admissions.branchId, branchId) : undefined,
        status ? eq(admissions.status, status as AdmissionStatus) : undefined,
      ].filter((f): f is NonNullable<typeof f> => f !== undefined);
      const where = filters.length ? and(...filters) : undefined;

      const [rows, [total]] = await request.tenantDb((db) =>
        Promise.all([
          db
            .select()
            .from(admissions)
            .where(where)
            .orderBy(admissions.applicantFirstName)
            .limit(limit)
            .offset((page - 1) * limit),
          db.select({ n: count() }).from(admissions).where(where),
        ]),
      );
      return {
        success: true as const,
        data: rows,
        meta: paginationMeta(total?.n ?? 0, page, limit),
      };
    },
  );

  r.get(
    '/admissions/:id',
    { config: view, schema: { tags: ['admissions'], params: idParamSchema } },
    async (request) => {
      const [row] = await request.tenantDb((db) =>
        db.select().from(admissions).where(eq(admissions.id, request.params.id)).limit(1),
      );
      assertFound(row, 'Admission');
      return { success: true as const, data: row };
    },
  );

  r.patch(
    '/admissions/:id',
    {
      config: manage,
      schema: {
        tags: ['admissions'],
        params: idParamSchema,
        body: createSchema.partial().omit({ branchId: true }),
      },
    },
    async (request) => {
      const updated = await request.tenantDb(async (db) => {
        const [before] = await db
          .select()
          .from(admissions)
          .where(eq(admissions.id, request.params.id))
          .limit(1);
        assertFound(before, 'Admission');
        const [row] = await db
          .update(admissions)
          .set({ ...request.body, updatedAt: new Date() })
          .where(eq(admissions.id, request.params.id))
          .returning();
        await writeAudit(db, request.auth!, {
          action: 'update',
          entityType: 'admission',
          entityId: request.params.id,
          oldValues: before,
          newValues: row,
        });
        return row!;
      });
      return { success: true as const, data: updated };
    },
  );

  // ── Status transition ──────────────────────────────────────
  r.post(
    '/admissions/:id/status',
    {
      config: manage,
      schema: {
        tags: ['admissions'],
        params: idParamSchema,
        body: z.object({
          status: z.enum([
            'under_review',
            'shortlisted',
            'interview',
            'offered',
            'accepted',
            'rejected',
            'withdrawn',
          ]),
          reason: z.string().max(300).optional(),
        }),
      },
    },
    async (request) => {
      const updated = await request.tenantDb(async (db) => {
        const [before] = await db
          .select()
          .from(admissions)
          .where(eq(admissions.id, request.params.id))
          .limit(1);
        assertFound(before, 'Admission');
        const allowed = TRANSITIONS[before.status];
        if (!allowed.includes(request.body.status)) {
          throw new AppError(
            ErrorCodes.CONFLICT,
            `Cannot move an application from ${before.status} to ${request.body.status}`,
            409,
          );
        }
        const [row] = await db
          .update(admissions)
          .set({
            status: request.body.status,
            statusReason: request.body.reason ?? null,
            updatedAt: new Date(),
          })
          .where(eq(admissions.id, request.params.id))
          .returning();
        await writeAudit(db, request.auth!, {
          action: 'update',
          entityType: 'admission',
          entityId: request.params.id,
          oldValues: { status: before.status },
          newValues: { status: row!.status, reason: request.body.reason },
        });
        return row!;
      });
      return { success: true as const, data: updated };
    },
  );

  // ── Convert an accepted application into a student ──────────
  r.post(
    '/admissions/:id/convert',
    {
      config: manage,
      schema: {
        tags: ['admissions'],
        params: idParamSchema,
        body: z.object({
          admissionNumber: z.string().min(1).max(50),
          currentClassId: z.string().uuid().optional(),
          currentSectionId: z.string().uuid().optional(),
          admissionDate: z.string().date().optional(),
        }),
      },
    },
    async (request, reply) => {
      const result = await request.tenantDb(async (db) => {
        const [adm] = await db
          .select()
          .from(admissions)
          .where(eq(admissions.id, request.params.id))
          .limit(1);
        assertFound(adm, 'Admission');
        if (adm.convertedStudentId) {
          throw new AppError(ErrorCodes.CONFLICT, 'Application already converted', 409);
        }
        if (adm.status !== 'accepted') {
          throw new AppError(
            ErrorCodes.CONFLICT,
            'Only an accepted application can be converted',
            409,
          );
        }

        const [student] = await db
          .insert(students)
          .values({
            tenantId: request.tenant!.id,
            branchId: adm.branchId,
            admissionNumber: request.body.admissionNumber,
            firstName: adm.applicantFirstName,
            lastName: adm.applicantLastName,
            dateOfBirth: adm.dateOfBirth,
            gender: adm.gender,
            currentClassId: request.body.currentClassId ?? adm.classAppliedFor,
            currentSectionId: request.body.currentSectionId ?? null,
            admissionDate: request.body.admissionDate ?? null,
            previousSchoolName: adm.previousSchoolName,
          })
          .returning();

        const [row] = await db
          .update(admissions)
          .set({ status: 'enrolled', convertedStudentId: student!.id, updatedAt: new Date() })
          .where(eq(admissions.id, request.params.id))
          .returning();

        await writeAudit(db, request.auth!, {
          action: 'update',
          entityType: 'admission',
          entityId: adm.id,
          oldValues: { status: adm.status },
          newValues: { status: 'enrolled', convertedStudentId: student!.id },
        });
        await emitEvent(db, {
          tenantId: request.tenant!.id,
          type: EVENT_TYPES.STUDENT_ADMITTED,
          aggregateType: 'student',
          aggregateId: student!.id,
          payload: {
            studentId: student!.id,
            admissionNumber: student!.admissionNumber,
            branchId: student!.branchId,
            fromAdmissionId: adm.id,
          },
        });
        return { admission: row!, student: student! };
      });
      return reply.status(201).send({ success: true as const, data: result });
    },
  );
}
