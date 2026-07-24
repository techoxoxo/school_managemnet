/**
 * P2-MOD-03/04: fee structures + allocation. Amounts are minor units. Each
 * structure item is a per-occurrence charge; allocation expands it into
 * per-period dues for every active student in the class, skipping monthly
 * periods before a mid-year admission (pro-ration for new admissions).
 */
import {
  academicSessions,
  auditLogs,
  classes,
  emitEvent,
  feeDiscounts,
  feeDues,
  feePaymentAllocations,
  feePayments,
  feeStructureItems,
  feeStructures,
  parents,
  parentStudent,
  students,
} from '@schoolmate/db';
import { AppError, ErrorCodes, EVENT_TYPES, dueStatus, outstanding } from '@schoolmate/shared';
import { and, asc, count, eq, inArray, ne, sql } from 'drizzle-orm';
import type { TenantDb } from '@schoolmate/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { writeAudit } from '../../lib/audit.js';
import { assertFound, idParamSchema } from '../../lib/http.js';
import { htmlToPdf } from '../../lib/pdf.js';
import { renderReceiptHtml } from '../../lib/receipt-template.js';

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
        const applied: Array<{ dueId: string; amount: number }> = [];
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
          applied.push({ dueId: d.id, amount: pay });
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

        if (applied.length) {
          await db.insert(feePaymentAllocations).values(
            applied.map((a) => ({
              tenantId: request.tenant!.id,
              paymentId: payment!.id,
              dueId: a.dueId,
              amount: a.amount,
            })),
          );
        }

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

  // ── Receipt PDF: reprint with audit trail (P2-MOD-07) ───────
  r.get(
    '/payments/:id/receipt.pdf',
    { config: view, schema: { tags: ['fees'], params: idParamSchema } },
    async (request, reply) => {
      const paymentId = request.params.id;
      const assembled = await request.tenantDb(async (db) => {
        const [payment] = await db
          .select()
          .from(feePayments)
          .where(eq(feePayments.id, paymentId))
          .limit(1);
        assertFound(payment, 'Payment');

        const [student] = await db
          .select({
            firstName: students.firstName,
            lastName: students.lastName,
            admissionNumber: students.admissionNumber,
            className: classes.name,
          })
          .from(students)
          .leftJoin(classes, eq(classes.id, students.currentClassId))
          .where(eq(students.id, payment.studentId))
          .limit(1);
        assertFound(student, 'Student');

        const lines = await db
          .select({
            head: feeDues.head,
            period: feeDues.period,
            amount: feePaymentAllocations.amount,
          })
          .from(feePaymentAllocations)
          .innerJoin(feeDues, eq(feeDues.id, feePaymentAllocations.dueId))
          .where(eq(feePaymentAllocations.paymentId, paymentId))
          .orderBy(asc(feeDues.dueDate));

        // Reprint = a receipt export was already recorded for this payment.
        const priorRows = await db
          .select({ n: count() })
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.entityType, 'fee_receipt'),
              eq(auditLogs.entityId, paymentId),
              eq(auditLogs.action, 'export'),
            ),
          );
        const reprint = (priorRows[0]?.n ?? 0) > 0;

        await writeAudit(db, request.auth!, {
          action: 'export',
          entityType: 'fee_receipt',
          entityId: paymentId,
          newValues: { receiptNumber: payment.receiptNumber, reprint },
        });

        return { payment, student, lines, reprint };
      });

      const html = renderReceiptHtml({
        schoolName: request.tenant!.name,
        receiptNumber: assembled.payment.receiptNumber,
        paidAt: assembled.payment.paidAt,
        method: assembled.payment.method,
        reference: assembled.payment.reference,
        studentName: [assembled.student.firstName, assembled.student.lastName]
          .filter(Boolean)
          .join(' '),
        admissionNumber: assembled.student.admissionNumber,
        className: assembled.student.className,
        amount: assembled.payment.amount,
        currency: '₹',
        lines: assembled.lines,
        reprint: assembled.reprint,
      });

      let pdf: Buffer;
      try {
        pdf = await htmlToPdf(html);
      } catch {
        throw new AppError(
          ErrorCodes.INTERNAL_ERROR,
          'PDF rendering is unavailable (Chrome could not be launched)',
          503,
        );
      }
      return reply
        .header('content-type', 'application/pdf')
        .header(
          'content-disposition',
          `inline; filename="receipt-${assembled.payment.receiptNumber}.pdf"`,
        )
        .send(pdf);
    },
  );

  // ── Reverse a payment: cheque bounce / refund (P2-MOD-09) ───
  r.post(
    '/payments/:id/reverse',
    {
      config: collect,
      schema: {
        tags: ['fees'],
        params: idParamSchema,
        body: z.object({
          type: z.enum(['bounce', 'refund']),
          reason: z.string().max(300).optional(),
        }),
      },
    },
    async (request) => {
      const result = await request.tenantDb(async (db) => {
        const [payment] = await db
          .select()
          .from(feePayments)
          .where(eq(feePayments.id, request.params.id))
          .limit(1);
        assertFound(payment, 'Payment');
        if (payment.status !== 'completed') {
          throw new AppError(ErrorCodes.CONFLICT, `Payment is already ${payment.status}`, 409);
        }

        // Undo each due this payment covered (exact reversal via allocations).
        const allocations = await db
          .select()
          .from(feePaymentAllocations)
          .where(eq(feePaymentAllocations.paymentId, payment.id));
        for (const a of allocations) {
          const [d] = await db.select().from(feeDues).where(eq(feeDues.id, a.dueId)).limit(1);
          if (!d) continue;
          const nextPaid = Math.max(0, d.amountPaid - a.amount);
          await db
            .update(feeDues)
            .set({
              amountPaid: nextPaid,
              status: dueStatus(d.amountDue, nextPaid, d.discountAmount),
              updatedAt: new Date(),
            })
            .where(eq(feeDues.id, d.id));
        }

        const newStatus = request.body.type === 'bounce' ? 'bounced' : 'refunded';
        const [row] = await db
          .update(feePayments)
          .set({ status: newStatus, remarks: request.body.reason ?? payment.remarks })
          .where(eq(feePayments.id, payment.id))
          .returning();
        await writeAudit(db, request.auth!, {
          action: 'update',
          entityType: 'fee_payment',
          entityId: payment.id,
          oldValues: { status: 'completed' },
          newValues: { status: newStatus, reversed: allocations.length },
        });
        return { payment: row!, reversedDues: allocations.length };
      });
      return { success: true as const, data: result };
    },
  );

  // ── Fee reports (P2-MOD-11) ─────────────────────────────────
  const N = (v: unknown) => Number(v ?? 0);

  // Outstanding + collection-efficiency snapshot.
  r.get(
    '/fees/reports/summary',
    {
      config: view,
      schema: { tags: ['fees'], querystring: z.object({ branchId: z.string().uuid().optional() }) },
    },
    async (request) => {
      const branchId = request.query.branchId ?? null;
      const data = await request.tenantDb(async (db) => {
        const totals = (
          await db.execute(sql`
            SELECT COALESCE(SUM(d.amount_due), 0) AS billed,
                   COALESCE(SUM(d.discount_amount), 0) AS discount,
                   COALESCE(SUM(d.amount_paid), 0) AS collected
            FROM fee_dues d
            ${branchId ? sql`JOIN students s ON s.id = d.student_id AND s.branch_id = ${branchId}` : sql``}
          `)
        ).rows[0] as { billed: string; discount: string; collected: string };
        const defaulters = (
          await db.execute(sql`
            SELECT COUNT(*) AS n FROM (
              SELECT d.student_id
              FROM fee_dues d
              ${branchId ? sql`JOIN students s ON s.id = d.student_id AND s.branch_id = ${branchId}` : sql``}
              GROUP BY d.student_id
              HAVING SUM(d.amount_due - d.discount_amount - d.amount_paid) > 0
            ) t
          `)
        ).rows[0] as { n: string };

        const billed = N(totals.billed);
        const discount = N(totals.discount);
        const collected = N(totals.collected);
        const net = billed - discount;
        const outstanding = net - collected;
        return {
          billed,
          discount,
          collected,
          outstanding,
          defaulters: N(defaulters.n),
          collectionEfficiency: net === 0 ? 100 : Math.round((collected / net) * 1000) / 10,
        };
      });
      return { success: true as const, data };
    },
  );

  // Collection over a date range: by method + by day.
  r.get(
    '/fees/reports/collection',
    {
      config: view,
      schema: {
        tags: ['fees'],
        querystring: z.object({
          from: z.string().date(),
          to: z.string().date(),
          branchId: z.string().uuid().optional(),
        }),
      },
    },
    async (request) => {
      const { from, to } = request.query;
      const branchId = request.query.branchId ?? null;
      const data = await request.tenantDb(async (db) => {
        const branchJoin = branchId
          ? sql`JOIN students s ON s.id = p.student_id AND s.branch_id = ${branchId}`
          : sql``;
        const where = sql`p.status = 'completed' AND p.paid_at::date BETWEEN ${from} AND ${to}`;
        const byMethod = (
          await db.execute(sql`
            SELECT p.method, COALESCE(SUM(p.amount), 0) AS total, COUNT(*) AS count
            FROM fee_payments p ${branchJoin} WHERE ${where}
            GROUP BY p.method ORDER BY total DESC
          `)
        ).rows as Array<{ method: string; total: string; count: string }>;
        const byDay = (
          await db.execute(sql`
            SELECT p.paid_at::date AS day, COALESCE(SUM(p.amount), 0) AS total
            FROM fee_payments p ${branchJoin} WHERE ${where}
            GROUP BY day ORDER BY day
          `)
        ).rows as Array<{ day: string; total: string }>;
        const total = byMethod.reduce((sum, m) => sum + N(m.total), 0);
        return {
          total,
          byMethod: byMethod.map((m) => ({
            method: m.method,
            total: N(m.total),
            count: N(m.count),
          })),
          byDay: byDay.map((d) => ({ day: d.day, total: N(d.total) })),
        };
      });
      return { success: true as const, data };
    },
  );

  // Head-wise billed vs collected.
  r.get(
    '/fees/reports/heads',
    {
      config: view,
      schema: { tags: ['fees'], querystring: z.object({ branchId: z.string().uuid().optional() }) },
    },
    async (request) => {
      const branchId = request.query.branchId ?? null;
      const rows = (
        await request.tenantDb((db) =>
          db.execute(sql`
            SELECT d.head,
                   COALESCE(SUM(d.amount_due), 0) AS billed,
                   COALESCE(SUM(d.discount_amount), 0) AS discount,
                   COALESCE(SUM(d.amount_paid), 0) AS collected
            FROM fee_dues d
            ${branchId ? sql`JOIN students s ON s.id = d.student_id AND s.branch_id = ${branchId}` : sql``}
            GROUP BY d.head ORDER BY billed DESC
          `),
        )
      ).rows as Array<{ head: string; billed: string; discount: string; collected: string }>;
      return {
        success: true as const,
        data: rows.map((r2) => ({
          head: r2.head,
          billed: N(r2.billed),
          discount: N(r2.discount),
          collected: N(r2.collected),
          outstanding: N(r2.billed) - N(r2.discount) - N(r2.collected),
        })),
      };
    },
  );

  // ── Defaulters + reminders (P2-MOD-10) ──────────────────────
  const defaulterQuery = (branchId: string | null, minAmount: number) => sql`
    SELECT d.student_id AS "studentId",
           s.first_name AS "firstName", s.last_name AS "lastName",
           s.admission_number AS "admissionNumber",
           SUM(d.amount_due - d.discount_amount - d.amount_paid) AS outstanding
    FROM fee_dues d
    JOIN students s ON s.id = d.student_id
    ${branchId ? sql`WHERE s.branch_id = ${branchId}` : sql``}
    GROUP BY d.student_id, s.first_name, s.last_name, s.admission_number
    HAVING SUM(d.amount_due - d.discount_amount - d.amount_paid) > ${minAmount}
    ORDER BY outstanding DESC
  `;

  r.get(
    '/fees/reports/defaulters',
    {
      config: view,
      schema: {
        tags: ['fees'],
        querystring: z.object({
          branchId: z.string().uuid().optional(),
          minAmount: z.coerce.number().int().min(0).optional(),
        }),
      },
    },
    async (request) => {
      const branchId = request.query.branchId ?? null;
      const minAmount = request.query.minAmount ?? 0;
      const rows = (await request.tenantDb((db) => db.execute(defaulterQuery(branchId, minAmount))))
        .rows as Array<{
        studentId: string;
        firstName: string;
        lastName: string | null;
        admissionNumber: string;
        outstanding: string;
      }>;
      return {
        success: true as const,
        data: rows.map((r2) => ({
          studentId: r2.studentId,
          name: [r2.firstName, r2.lastName].filter(Boolean).join(' '),
          admissionNumber: r2.admissionNumber,
          outstanding: Number(r2.outstanding),
        })),
      };
    },
  );

  // Emit an overdue reminder per defaulter (event-driven via the outbox).
  r.post(
    '/fees/reminders/send',
    {
      config: manage,
      schema: {
        tags: ['fees'],
        body: z.object({
          branchId: z.string().uuid().optional(),
          minAmount: z.number().int().min(0).optional(),
        }),
      },
    },
    async (request) => {
      const branchId = request.body.branchId ?? null;
      const minAmount = request.body.minAmount ?? 0;
      const result = await request.tenantDb(async (db) => {
        const defaulters = (await db.execute(defaulterQuery(branchId, minAmount))).rows as Array<{
          studentId: string;
          firstName: string;
          lastName: string | null;
          outstanding: string;
        }>;
        if (defaulters.length === 0) return { defaulters: 0, reminded: 0 };

        const ids = defaulters.map((d) => d.studentId);
        const links = await db
          .select({
            studentId: parentStudent.studentId,
            userId: parents.userId,
            phone: parents.phone,
          })
          .from(parentStudent)
          .innerJoin(parents, eq(parents.id, parentStudent.parentId))
          .where(inArray(parentStudent.studentId, ids));
        const byStudent = new Map<
          string,
          Array<{ userId?: string | undefined; phone?: string | undefined }>
        >();
        for (const l of links) {
          const arr = byStudent.get(l.studentId) ?? [];
          arr.push({ userId: l.userId ?? undefined, phone: l.phone ?? undefined });
          byStudent.set(l.studentId, arr);
        }

        let reminded = 0;
        for (const d of defaulters) {
          const recipients = byStudent.get(d.studentId) ?? [];
          if (recipients.length === 0) continue;
          await emitEvent(db, {
            tenantId: request.tenant!.id,
            type: EVENT_TYPES.FEE_PAYMENT_OVERDUE,
            aggregateType: 'student',
            aggregateId: d.studentId,
            payload: {
              studentId: d.studentId,
              studentName: [d.firstName, d.lastName].filter(Boolean).join(' '),
              outstanding: Number(d.outstanding),
              recipients,
            },
          });
          reminded += 1;
        }
        await writeAudit(db, request.auth!, {
          action: 'create',
          entityType: 'fee_reminder_run',
          entityId: `${branchId ?? 'all'}:${new Date().toISOString().slice(0, 10)}`,
          newValues: { defaulters: defaulters.length, reminded },
        });
        return { defaulters: defaulters.length, reminded };
      });
      return { success: true as const, data: result };
    },
  );

  // ── Discounts & concessions (P2-MOD-05) ─────────────────────
  const discountType = z.enum(['sibling', 'merit', 'staff_ward', 'scholarship', 'custom']);
  const valueType = z.enum(['flat', 'percent']);

  /** Apply a concession across a student's dues (percent per-due, flat FIFO). */
  async function applyConcessionToDues(
    db: TenantDb,
    studentId: string,
    vType: 'flat' | 'percent',
    value: number,
  ): Promise<number> {
    const dues = await db
      .select()
      .from(feeDues)
      .where(eq(feeDues.studentId, studentId))
      .orderBy(asc(feeDues.dueDate));
    let applied = 0;
    let remaining = value; // only used for flat
    for (const d of dues) {
      const room = d.amountDue - d.amountPaid - d.discountAmount; // still discountable
      if (room <= 0) continue;
      let add: number;
      if (vType === 'percent') {
        add = Math.min(Math.round((d.amountDue * value) / 10000), room);
      } else {
        if (remaining <= 0) break;
        add = Math.min(room, remaining);
        remaining -= add;
      }
      if (add <= 0) continue;
      const nextDiscount = d.discountAmount + add;
      await db
        .update(feeDues)
        .set({
          discountAmount: nextDiscount,
          status: dueStatus(d.amountDue, d.amountPaid, nextDiscount),
          updatedAt: new Date(),
        })
        .where(eq(feeDues.id, d.id));
      applied += add;
    }
    return applied;
  }

  r.post(
    '/students/:id/discounts',
    {
      config: manage,
      schema: {
        tags: ['fees'],
        params: idParamSchema,
        body: z.object({
          discountType,
          valueType,
          value: z.number().int().min(1),
          reason: z.string().max(300).optional(),
          autoApprove: z.boolean().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { discountType: dType, valueType: vType, value, reason, autoApprove } = request.body;
      const result = await request.tenantDb(async (db) => {
        const [student] = await db
          .select({ id: students.id })
          .from(students)
          .where(eq(students.id, request.params.id))
          .limit(1);
        assertFound(student, 'Student');
        const status = autoApprove ? 'approved' : 'pending';
        const [row] = await db
          .insert(feeDiscounts)
          .values({
            tenantId: request.tenant!.id,
            studentId: request.params.id,
            discountType: dType,
            valueType: vType,
            value,
            reason: reason ?? null,
            status,
            approvedBy: autoApprove ? request.auth!.userId : null,
          })
          .returning();
        let applied = 0;
        if (status === 'approved') {
          applied = await applyConcessionToDues(db, request.params.id, vType, value);
        }
        await writeAudit(db, request.auth!, {
          action: 'create',
          entityType: 'fee_discount',
          entityId: row!.id,
          newValues: { discountType: dType, valueType: vType, value, status, applied },
        });
        return { discount: row!, applied };
      });
      return reply.status(201).send({ success: true as const, data: result });
    },
  );

  r.get(
    '/students/:id/discounts',
    { config: view, schema: { tags: ['fees'], params: idParamSchema } },
    async (request) => {
      const rows = await request.tenantDb((db) =>
        db.select().from(feeDiscounts).where(eq(feeDiscounts.studentId, request.params.id)),
      );
      return { success: true as const, data: rows };
    },
  );

  r.post(
    '/students/:id/discounts/:discountId/approve',
    {
      config: manage,
      schema: {
        tags: ['fees'],
        params: z.object({ id: z.string().uuid(), discountId: z.string().uuid() }),
        body: z.object({ status: z.enum(['approved', 'rejected']) }),
      },
    },
    async (request) => {
      const result = await request.tenantDb(async (db) => {
        const [before] = await db
          .select()
          .from(feeDiscounts)
          .where(
            and(
              eq(feeDiscounts.id, request.params.discountId),
              eq(feeDiscounts.studentId, request.params.id),
            ),
          )
          .limit(1);
        assertFound(before, 'Discount');
        if (before.status === 'approved') {
          throw new AppError(ErrorCodes.CONFLICT, 'Discount already approved', 409);
        }
        const [row] = await db
          .update(feeDiscounts)
          .set({ status: request.body.status, approvedBy: request.auth!.userId })
          .where(eq(feeDiscounts.id, request.params.discountId))
          .returning();
        let applied = 0;
        if (request.body.status === 'approved') {
          applied = await applyConcessionToDues(
            db,
            request.params.id,
            before.valueType as 'flat' | 'percent',
            before.value,
          );
        }
        await writeAudit(db, request.auth!, {
          action: 'update',
          entityType: 'fee_discount',
          entityId: request.params.discountId,
          oldValues: { status: before.status },
          newValues: { status: row!.status, applied },
        });
        return { discount: row!, applied };
      });
      return { success: true as const, data: result };
    },
  );

  // Sibling auto-apply: if the student shares a parent with another active
  // student, grant + apply a sibling concession (default 10%).
  r.post(
    '/students/:id/discounts/apply-sibling',
    {
      config: manage,
      schema: {
        tags: ['fees'],
        params: idParamSchema,
        body: z.object({
          valueType: valueType.optional(),
          value: z.number().int().min(1).optional(),
        }),
      },
    },
    async (request) => {
      const vType = request.body.valueType ?? 'percent';
      const value = request.body.value ?? 1000; // 10%
      const result = await request.tenantDb(async (db) => {
        const parentLinks = await db
          .select({ parentId: parentStudent.parentId })
          .from(parentStudent)
          .where(eq(parentStudent.studentId, request.params.id));
        if (parentLinks.length === 0) return { applied: false as const, reason: 'no parents' };
        const parentIds = parentLinks.map((p) => p.parentId);
        const siblingLinks = await db
          .select({ studentId: parentStudent.studentId })
          .from(parentStudent)
          .where(
            and(
              inArray(parentStudent.parentId, parentIds),
              ne(parentStudent.studentId, request.params.id),
            ),
          );
        if (siblingLinks.length === 0) return { applied: false as const, reason: 'no siblings' };

        const [row] = await db
          .insert(feeDiscounts)
          .values({
            tenantId: request.tenant!.id,
            studentId: request.params.id,
            discountType: 'sibling',
            valueType: vType,
            value,
            reason: 'Sibling concession (auto)',
            status: 'approved',
            approvedBy: request.auth!.userId,
          })
          .returning();
        const appliedAmount = await applyConcessionToDues(db, request.params.id, vType, value);
        await writeAudit(db, request.auth!, {
          action: 'create',
          entityType: 'fee_discount',
          entityId: row!.id,
          newValues: { discountType: 'sibling', valueType: vType, value, applied: appliedAmount },
        });
        return { applied: true as const, discountId: row!.id, appliedAmount };
      });
      return { success: true as const, data: result };
    },
  );
}
