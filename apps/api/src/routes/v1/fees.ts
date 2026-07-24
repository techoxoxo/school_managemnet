/**
 * P2-MOD-03/04: fee structures + allocation. Amounts are minor units. Each
 * structure item is a per-occurrence charge; allocation expands it into
 * per-period dues for every active student in the class, skipping monthly
 * periods before a mid-year admission (pro-ration for new admissions).
 */
import {
  academicSessions,
  emitEvent,
  feeDues,
  feePayments,
  feeStructureItems,
  feeStructures,
  students,
} from '@schoolmate/db';
import { EVENT_TYPES, dueStatus, outstanding } from '@schoolmate/shared';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { writeAudit } from '../../lib/audit.js';
import { assertFound, idParamSchema } from '../../lib/http.js';

const frequency = z.enum(['one_time', 'monthly', 'quarterly', 'half_yearly', 'annual']);
type Frequency = z.infer<typeof frequency>;

const PERIOD_COUNT: Record<Frequency, number> = {
  one_time: 1,
  annual: 1,
  monthly: 12,
  quarterly: 4,
  half_yearly: 2,
};
const PERIOD_STEP: Record<Frequency, number> = {
  one_time: 0,
  annual: 0,
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
};

const ym = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
function addMonths(d: Date, n: number): Date {
  const next = new Date(d);
  next.setUTCMonth(next.getUTCMonth() + n);
  return next;
}

/** Expand a frequency into concrete periods anchored at the session start. */
function generatePeriods(freq: Frequency, sessionStart: string) {
  const start = new Date(`${sessionStart}T00:00:00.000Z`);
  return Array.from({ length: PERIOD_COUNT[freq] }, (_, i) => {
    const d = addMonths(start, PERIOD_STEP[freq] * i);
    const period =
      freq === 'monthly'
        ? ym(d)
        : freq === 'annual' || freq === 'one_time'
          ? freq
          : `${freq === 'quarterly' ? 'Q' : 'H'}${i + 1}`;
    return { period, dueDate: d.toISOString().slice(0, 10), ym: ym(d) };
  });
}

export async function feeRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const view = { permission: 'fee.view' };
  const manage = { permission: 'fee.manage' };

  // ── Fee structures ─────────────────────────────────────────
  r.post(
    '/fee-structures',
    {
      config: manage,
      schema: {
        tags: ['fees'],
        body: z.object({
          branchId: z.string().uuid(),
          academicSessionId: z.string().uuid(),
          classId: z.string().uuid().optional(),
          name: z.string().min(1).max(120),
          items: z
            .array(
              z.object({
                head: z.string().min(1).max(80),
                amount: z.number().int().min(0),
                frequency: frequency.optional(),
              }),
            )
            .optional(),
        }),
      },
    },
    async (request, reply) => {
      const { items, ...structure } = request.body;
      const created = await request.tenantDb(async (db) => {
        const [row] = await db
          .insert(feeStructures)
          .values({ ...structure, tenantId: request.tenant!.id })
          .returning();
        if (items?.length) {
          await db.insert(feeStructureItems).values(
            items.map((it) => ({
              tenantId: request.tenant!.id,
              structureId: row!.id,
              head: it.head,
              amount: it.amount,
              frequency: it.frequency ?? 'annual',
            })),
          );
        }
        await writeAudit(db, request.auth!, {
          action: 'create',
          entityType: 'fee_structure',
          entityId: row!.id,
          newValues: { name: row!.name, items: items?.length ?? 0 },
        });
        return row!;
      });
      return reply.status(201).send({ success: true as const, data: created });
    },
  );

  r.get(
    '/fee-structures',
    {
      config: view,
      schema: {
        tags: ['fees'],
        querystring: z.object({
          branchId: z.string().uuid().optional(),
          academicSessionId: z.string().uuid().optional(),
        }),
      },
    },
    async (request) => {
      const filters = [
        request.query.branchId ? eq(feeStructures.branchId, request.query.branchId) : undefined,
        request.query.academicSessionId
          ? eq(feeStructures.academicSessionId, request.query.academicSessionId)
          : undefined,
      ].filter((f): f is NonNullable<typeof f> => f !== undefined);
      const rows = await request.tenantDb((db) =>
        db
          .select()
          .from(feeStructures)
          .where(filters.length ? and(...filters) : undefined)
          .orderBy(asc(feeStructures.name)),
      );
      return { success: true as const, data: rows };
    },
  );

  r.get(
    '/fee-structures/:id',
    { config: view, schema: { tags: ['fees'], params: idParamSchema } },
    async (request) => {
      const data = await request.tenantDb(async (db) => {
        const [structure] = await db
          .select()
          .from(feeStructures)
          .where(eq(feeStructures.id, request.params.id))
          .limit(1);
        assertFound(structure, 'Fee structure');
        const items = await db
          .select()
          .from(feeStructureItems)
          .where(eq(feeStructureItems.structureId, structure.id));
        return { ...structure, items };
      });
      return { success: true as const, data };
    },
  );

  r.post(
    '/fee-structures/:id/items',
    {
      config: manage,
      schema: {
        tags: ['fees'],
        params: idParamSchema,
        body: z.object({
          head: z.string().min(1).max(80),
          amount: z.number().int().min(0),
          frequency: frequency.optional(),
        }),
      },
    },
    async (request, reply) => {
      const created = await request.tenantDb(async (db) => {
        const [structure] = await db
          .select({ id: feeStructures.id })
          .from(feeStructures)
          .where(eq(feeStructures.id, request.params.id))
          .limit(1);
        assertFound(structure, 'Fee structure');
        const [row] = await db
          .insert(feeStructureItems)
          .values({
            tenantId: request.tenant!.id,
            structureId: request.params.id,
            head: request.body.head,
            amount: request.body.amount,
            frequency: request.body.frequency ?? 'annual',
          })
          .returning();
        return row!;
      });
      return reply.status(201).send({ success: true as const, data: created });
    },
  );

  // ── Allocation: structure → per-student, per-period dues ────
  r.post(
    '/fee-structures/:id/allocate',
    { config: manage, schema: { tags: ['fees'], params: idParamSchema } },
    async (request) => {
      const result = await request.tenantDb(async (db) => {
        const [structure] = await db
          .select()
          .from(feeStructures)
          .where(eq(feeStructures.id, request.params.id))
          .limit(1);
        assertFound(structure, 'Fee structure');
        if (!structure.classId) {
          throw new Error('Fee structure has no class to allocate to');
        }
        const [session] = await db
          .select()
          .from(academicSessions)
          .where(eq(academicSessions.id, structure.academicSessionId))
          .limit(1);
        assertFound(session, 'Academic session');

        const items = await db
          .select()
          .from(feeStructureItems)
          .where(eq(feeStructureItems.structureId, structure.id));
        const enrolled = await db
          .select()
          .from(students)
          .where(
            and(eq(students.currentClassId, structure.classId), eq(students.status, 'active')),
          );

        // Skip dues that already exist (idempotent re-allocation).
        const itemIds = items.map((i) => i.id);
        const existing = itemIds.length
          ? await db
              .select({
                studentId: feeDues.studentId,
                structureItemId: feeDues.structureItemId,
                period: feeDues.period,
              })
              .from(feeDues)
              .where(inArray(feeDues.structureItemId, itemIds))
          : [];
        const seen = new Set(
          existing.map((e) => `${e.studentId}:${e.structureItemId}:${e.period}`),
        );

        const rows: (typeof feeDues.$inferInsert)[] = [];
        for (const student of enrolled) {
          const admittedYm = student.admissionDate ? student.admissionDate.slice(0, 7) : null;
          for (const item of items) {
            for (const p of generatePeriods(item.frequency, session.startDate)) {
              // Mid-year pro-ration: monthly dues before the admission month are skipped.
              if (item.frequency === 'monthly' && admittedYm && p.ym < admittedYm) continue;
              if (seen.has(`${student.id}:${item.id}:${p.period}`)) continue;
              rows.push({
                tenantId: request.tenant!.id,
                studentId: student.id,
                structureItemId: item.id,
                head: item.head,
                period: p.period,
                amountDue: item.amount,
                dueDate: p.dueDate,
              });
            }
          }
        }
        if (rows.length) await db.insert(feeDues).values(rows);
        await writeAudit(db, request.auth!, {
          action: 'create',
          entityType: 'fee_allocation',
          entityId: structure.id,
          newValues: { students: enrolled.length, duesCreated: rows.length },
        });
        return { students: enrolled.length, duesCreated: rows.length };
      });
      return { success: true as const, data: result };
    },
  );

  // ── Collection desk (P2-MOD-06): outstanding view + collect ─
  const collect = { permission: 'fee.collect' };

  r.get(
    '/students/:id/fees',
    { config: view, schema: { tags: ['fees'], params: idParamSchema } },
    async (request) => {
      const data = await request.tenantDb(async (db) => {
        const dues = await db
          .select()
          .from(feeDues)
          .where(eq(feeDues.studentId, request.params.id))
          .orderBy(asc(feeDues.dueDate));
        const payments = await db
          .select()
          .from(feePayments)
          .where(eq(feePayments.studentId, request.params.id))
          .orderBy(asc(feePayments.paidAt));
        const totalOutstanding = dues.reduce(
          (sum, d) => sum + outstanding(d.amountDue, d.amountPaid, d.discountAmount),
          0,
        );
        return { dues, payments, totalOutstanding };
      });
      return { success: true as const, data };
    },
  );

  r.post(
    '/students/:id/payments',
    {
      config: collect,
      schema: {
        tags: ['fees'],
        params: idParamSchema,
        body: z.object({
          amount: z.number().int().min(1),
          method: z
            .enum(['cash', 'cheque', 'upi', 'card', 'net_banking', 'bank_transfer', 'online'])
            .optional(),
          reference: z.string().max(120).optional(),
          remarks: z.string().max(300).optional(),
        }),
      },
    },
    async (request, reply) => {
      const { amount, method, reference, remarks } = request.body;
      const result = await request.tenantDb(async (db) => {
        const [student] = await db
          .select({ id: students.id, branchId: students.branchId })
          .from(students)
          .where(eq(students.id, request.params.id))
          .limit(1);
        assertFound(student, 'Student');

        // FIFO: apply the payment to the oldest unpaid dues first.
        const dues = await db
          .select()
          .from(feeDues)
          .where(eq(feeDues.studentId, request.params.id))
          .orderBy(asc(feeDues.dueDate));
        let remaining = amount;
        let allocated = 0;
        for (const d of dues) {
          if (remaining <= 0) break;
          const owed = outstanding(d.amountDue, d.amountPaid, d.discountAmount);
          if (owed <= 0) continue;
          const pay = Math.min(owed, remaining);
          const nextPaid = d.amountPaid + pay;
          await db
            .update(feeDues)
            .set({
              amountPaid: nextPaid,
              status: dueStatus(d.amountDue, nextPaid, d.discountAmount),
              updatedAt: new Date(),
            })
            .where(eq(feeDues.id, d.id));
          remaining -= pay;
          allocated += pay;
        }

        // Receipt number: R-<year>-<zero-padded per-tenant sequence>.
        const countRows = await db.select({ n: count() }).from(feePayments);
        const seq = (countRows[0]?.n ?? 0) + 1;
        const receiptNumber = `R-${new Date().getUTCFullYear()}-${String(seq).padStart(6, '0')}`;

        const [payment] = await db
          .insert(feePayments)
          .values({
            tenantId: request.tenant!.id,
            studentId: request.params.id,
            amount,
            method: method ?? 'cash',
            reference: reference ?? null,
            receiptNumber,
            collectedBy: request.auth!.userId,
            remarks: remarks ?? null,
          })
          .returning();

        await writeAudit(db, request.auth!, {
          action: 'create',
          entityType: 'fee_payment',
          entityId: payment!.id,
          newValues: { amount, allocated, receiptNumber },
        });
        await emitEvent(db, {
          tenantId: request.tenant!.id,
          type: EVENT_TYPES.FEE_PAYMENT_RECEIVED,
          aggregateType: 'fee_payment',
          aggregateId: payment!.id,
          payload: { studentId: request.params.id, amount, receiptNumber },
        });

        return {
          payment: payment!,
          allocated,
          advance: amount - allocated, // unallocated overpayment (credit)
        };
      });
      return reply.status(201).send({ success: true as const, data: result });
    },
  );
}
