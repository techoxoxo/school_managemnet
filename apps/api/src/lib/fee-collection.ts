/**
 * Shared fee-collection primitive (P2-MOD-06/08). Applies a payment to a
 * student's dues oldest-first (FIFO), records the payment with a per-tenant
 * receipt number, and writes the allocations. Used by the manual collection
 * desk and the payment-gateway webhook so both settle money identically.
 */
import { feeDues, feePaymentAllocations, feePayments, type TenantDb } from '@schoolmate/db';
import { dueStatus, outstanding } from '@schoolmate/shared';
import { asc, count, eq } from 'drizzle-orm';

export interface ApplyPaymentParams {
  tenantId: string;
  studentId: string;
  /** Minor units. */
  amount: number;
  method?: 'cash' | 'cheque' | 'upi' | 'card' | 'net_banking' | 'bank_transfer' | 'online';
  reference?: string | null;
  remarks?: string | null;
  collectedBy?: string | null;
}

export interface ApplyPaymentResult {
  payment: typeof feePayments.$inferSelect;
  allocated: number;
  /** Unallocated overpayment (credit on account). */
  advance: number;
}

/** Must run inside a tenant-scoped transaction (RLS GUC already set). */
export async function applyPaymentFifo(
  db: TenantDb,
  params: ApplyPaymentParams,
): Promise<ApplyPaymentResult> {
  const { tenantId, studentId, amount } = params;

  const dues = await db
    .select()
    .from(feeDues)
    .where(eq(feeDues.studentId, studentId))
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
      tenantId,
      studentId,
      amount,
      method: params.method ?? 'cash',
      reference: params.reference ?? null,
      receiptNumber,
      collectedBy: params.collectedBy ?? null,
      remarks: params.remarks ?? null,
    })
    .returning();

  if (applied.length) {
    await db.insert(feePaymentAllocations).values(
      applied.map((a) => ({
        tenantId,
        paymentId: payment!.id,
        dueId: a.dueId,
        amount: a.amount,
      })),
    );
  }

  return { payment: payment!, allocated, advance: amount - allocated };
}
