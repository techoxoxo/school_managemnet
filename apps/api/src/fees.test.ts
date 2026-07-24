/**
 * Fee management (P2-MOD-03/04/06) — live Postgres + Redis.
 * Structure → allocate (with mid-year pro-ration) → outstanding view →
 * collect (FIFO allocation, receipts, overpayment/advance).
 */
import {
  createDb,
  createPool,
  outboxEvents,
  tenants,
  users,
  userTenantRoles,
} from '@schoolmate/db';
import bcrypt from 'bcryptjs';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

const ADMIN_URL =
  process.env.DATABASE_URL ?? 'postgres://schoolmate:schoolmate_dev@localhost:5433/schoolmate';

let app: FastifyInstance;
const adminPool = createPool(ADMIN_URL);
const adminDb = createDb(adminPool);

const suffix = Date.now().toString(36);
const SLUG = `fee-${suffix}`;
const ADMIN_EMAIL = `feeadmin-${suffix}@test.dev`;
const TEACHER_EMAIL = `feeteacher-${suffix}@test.dev`;
const PASSWORD = 'pw-12345678';

let tenantId: string;
let branchId: string;
let sessionId: string;
let classId: string;
let studentA: string;
let adminToken: string;
let teacherToken: string;

const auth = (t: string) => ({ 'x-tenant-slug': SLUG, authorization: `Bearer ${t}` });
const login = async (email: string) =>
  (
    await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'x-tenant-slug': SLUG },
      payload: { email, password: PASSWORD },
    })
  ).json().data.accessToken as string;

beforeAll(async () => {
  const [t] = await adminDb
    .insert(tenants)
    .values({ name: 'Fee Test', slug: SLUG, subscriptionStatus: 'active' })
    .returning();
  tenantId = t!.id;
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const ins = await adminDb
    .insert(users)
    .values([
      { email: ADMIN_EMAIL, passwordHash, status: 'active' },
      { email: TEACHER_EMAIL, passwordHash, status: 'active' },
    ])
    .returning();
  await adminDb.insert(userTenantRoles).values([
    { userId: ins[0]!.id, tenantId, role: 'tenant_admin', isPrimaryRole: true },
    { userId: ins[1]!.id, tenantId, role: 'teacher', isPrimaryRole: true },
  ]);

  app = await buildApp();
  await app.ready();
  adminToken = await login(ADMIN_EMAIL);
  teacherToken = await login(TEACHER_EMAIL);

  branchId = (
    await app.inject({
      method: 'POST',
      url: '/v1/branches',
      headers: auth(adminToken),
      payload: { name: 'Main', code: 'MAIN' },
    })
  ).json().data.id;
  sessionId = (
    await app.inject({
      method: 'POST',
      url: '/v1/academic-sessions',
      headers: auth(adminToken),
      payload: {
        branchId,
        name: '2026-2027',
        startDate: '2026-04-01',
        endDate: '2027-03-31',
        isCurrent: true,
      },
    })
  ).json().data.id;
  classId = (
    await app.inject({
      method: 'POST',
      url: '/v1/classes',
      headers: auth(adminToken),
      payload: { branchId, name: 'Grade 1', classType: 'primary' },
    })
  ).json().data.id;
  studentA = (
    await app.inject({
      method: 'POST',
      url: '/v1/students',
      headers: auth(adminToken),
      payload: {
        branchId,
        admissionNumber: `FA-${suffix}`,
        firstName: 'Full',
        currentClassId: classId,
        admissionDate: '2026-04-01',
      },
    })
  ).json().data.id;
});

afterAll(async () => {
  await adminDb.execute(sql`DELETE FROM tenants WHERE id = ${tenantId}`);
  await adminDb.execute(sql`DELETE FROM users WHERE email IN (${ADMIN_EMAIL}, ${TEACHER_EMAIL})`);
  await app.close();
  await adminPool.end();
});

let structureId: string;

describe('fee structures + allocation (P2-MOD-03/04)', () => {
  it('creates a structure with items', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/fee-structures',
      headers: auth(adminToken),
      payload: {
        branchId,
        academicSessionId: sessionId,
        classId,
        name: 'Grade 1 · 2026-27',
        items: [
          { head: 'Tuition', amount: 1000, frequency: 'monthly' },
          { head: 'Admission', amount: 5000, frequency: 'one_time' },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    structureId = res.json().data.id;
  });

  it('allocates dues to enrolled students (12 monthly + 1 one-time)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/fee-structures/${structureId}/allocate`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ students: 1, duesCreated: 13 });
  });

  it('re-allocation is idempotent (no duplicate dues)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/fee-structures/${structureId}/allocate`,
      headers: auth(adminToken),
    });
    expect(res.json().data.duesCreated).toBe(0);
  });

  it('pro-rates a mid-year admission (only remaining monthly periods)', async () => {
    // Admitted in October 2026 → Oct..Mar = 6 monthly + 1 one-time = 7 dues.
    await app.inject({
      method: 'POST',
      url: '/v1/students',
      headers: auth(adminToken),
      payload: {
        branchId,
        admissionNumber: `FB-${suffix}`,
        firstName: 'MidYear',
        currentClassId: classId,
        admissionDate: '2026-10-15',
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/v1/fee-structures/${structureId}/allocate`,
      headers: auth(adminToken),
    });
    expect(res.json().data.duesCreated).toBe(7);
  });
});

describe('fee collection desk (P2-MOD-06)', () => {
  it('shows the outstanding total (12×1000 + 5000 = 17000)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/students/${studentA}/fees`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.totalOutstanding).toBe(17000);
  });

  it('collects a partial payment FIFO and issues a receipt', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/students/${studentA}/payments`,
      headers: auth(adminToken),
      payload: { amount: 6000, method: 'cash' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.allocated).toBe(6000);
    expect(res.json().data.payment.receiptNumber).toMatch(/^R-\d{4}-\d{6}$/);

    const after = await app.inject({
      method: 'GET',
      url: `/v1/students/${studentA}/fees`,
      headers: auth(adminToken),
    });
    expect(after.json().data.totalOutstanding).toBe(11000);
  });

  it('handles overpayment as advance and clears the balance', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/students/${studentA}/payments`,
      headers: auth(adminToken),
      payload: { amount: 11500, method: 'upi', reference: 'UPI123' },
    });
    expect(res.json().data).toMatchObject({ allocated: 11000, advance: 500 });

    const after = await app.inject({
      method: 'GET',
      url: `/v1/students/${studentA}/fees`,
      headers: auth(adminToken),
    });
    expect(after.json().data.totalOutstanding).toBe(0);
  });

  it('a teacher (no fee.collect) cannot collect → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/students/${studentA}/payments`,
      headers: auth(teacherToken),
      payload: { amount: 100 },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('discounts & concessions (P2-MOD-05)', () => {
  let dStudent: string;

  it('an approved percent discount reduces the outstanding total', async () => {
    // Fresh student in the class, then allocate this structure to them.
    dStudent = (
      await app.inject({
        method: 'POST',
        url: '/v1/students',
        headers: auth(adminToken),
        payload: {
          branchId,
          admissionNumber: `FD-${suffix}`,
          firstName: 'Discounted',
          currentClassId: classId,
          admissionDate: '2026-04-01',
        },
      })
    ).json().data.id;
    await app.inject({
      method: 'POST',
      url: `/v1/fee-structures/${structureId}/allocate`,
      headers: auth(adminToken),
    });

    const before = await app.inject({
      method: 'GET',
      url: `/v1/students/${dStudent}/fees`,
      headers: auth(adminToken),
    });
    expect(before.json().data.totalOutstanding).toBe(17000); // 12×1000 + 5000

    // 10% auto-approved discount.
    const disc = await app.inject({
      method: 'POST',
      url: `/v1/students/${dStudent}/discounts`,
      headers: auth(adminToken),
      payload: { discountType: 'merit', valueType: 'percent', value: 1000, autoApprove: true },
    });
    expect(disc.statusCode).toBe(201);
    expect(disc.json().data.applied).toBe(1700); // 10% of 17000

    const after = await app.inject({
      method: 'GET',
      url: `/v1/students/${dStudent}/fees`,
      headers: auth(adminToken),
    });
    expect(after.json().data.totalOutstanding).toBe(15300);
  });

  it('a pending discount applies only on approval', async () => {
    const disc = await app.inject({
      method: 'POST',
      url: `/v1/students/${dStudent}/discounts`,
      headers: auth(adminToken),
      payload: { discountType: 'custom', valueType: 'flat', value: 300 },
    });
    expect(disc.json().data.applied).toBe(0); // pending → not applied yet
    const discountId = disc.json().data.discount.id;

    const approve = await app.inject({
      method: 'POST',
      url: `/v1/students/${dStudent}/discounts/${discountId}/approve`,
      headers: auth(adminToken),
      payload: { status: 'approved' },
    });
    expect(approve.json().data.applied).toBe(300);

    const after = await app.inject({
      method: 'GET',
      url: `/v1/students/${dStudent}/fees`,
      headers: auth(adminToken),
    });
    expect(after.json().data.totalOutstanding).toBe(15000); // 15300 - 300
  });

  it('sibling auto-apply grants a concession when a sibling shares a parent', async () => {
    // Link a parent to the discounted student and to a new sibling.
    const parentId = (
      await app.inject({
        method: 'POST',
        url: '/v1/parents',
        headers: auth(adminToken),
        payload: { firstName: 'Shared', phone: '555-0999' },
      })
    ).json().data.id;
    const sibling = (
      await app.inject({
        method: 'POST',
        url: '/v1/students',
        headers: auth(adminToken),
        payload: {
          branchId,
          admissionNumber: `FS-${suffix}`,
          firstName: 'Sib',
          currentClassId: classId,
        },
      })
    ).json().data.id;
    for (const sid of [dStudent, sibling]) {
      await app.inject({
        method: 'POST',
        url: `/v1/students/${sid}/parents`,
        headers: auth(adminToken),
        payload: { parentId },
      });
    }

    const res = await app.inject({
      method: 'POST',
      url: `/v1/students/${dStudent}/discounts/apply-sibling`,
      headers: auth(adminToken),
      payload: { valueType: 'percent', value: 500 }, // 5%
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.applied).toBe(true);
    expect(res.json().data.appliedAmount).toBeGreaterThan(0);
  });

  it('sibling auto-apply is a no-op for an only child', async () => {
    const lone = (
      await app.inject({
        method: 'POST',
        url: '/v1/students',
        headers: auth(adminToken),
        payload: {
          branchId,
          admissionNumber: `FL-${suffix}`,
          firstName: 'Lonely',
          currentClassId: classId,
        },
      })
    ).json().data.id;
    const res = await app.inject({
      method: 'POST',
      url: `/v1/students/${lone}/discounts/apply-sibling`,
      headers: auth(adminToken),
      payload: {},
    });
    expect(res.json().data.applied).toBe(false);
  });
});

describe('payment reversal: bounce & refund (P2-MOD-09)', () => {
  let rStudent: string;
  let paymentId: string;

  it('collecting then bouncing a cheque restores the outstanding balance', async () => {
    rStudent = (
      await app.inject({
        method: 'POST',
        url: '/v1/students',
        headers: auth(adminToken),
        payload: {
          branchId,
          admissionNumber: `FR-${suffix}`,
          firstName: 'Reversal',
          currentClassId: classId,
          admissionDate: '2026-04-01',
        },
      })
    ).json().data.id;
    await app.inject({
      method: 'POST',
      url: `/v1/fee-structures/${structureId}/allocate`,
      headers: auth(adminToken),
    });

    const pay = await app.inject({
      method: 'POST',
      url: `/v1/students/${rStudent}/payments`,
      headers: auth(adminToken),
      payload: { amount: 8000, method: 'cheque', reference: 'CHQ-77' },
    });
    paymentId = pay.json().data.payment.id;
    const mid = await app.inject({
      method: 'GET',
      url: `/v1/students/${rStudent}/fees`,
      headers: auth(adminToken),
    });
    expect(mid.json().data.totalOutstanding).toBe(9000); // 17000 - 8000

    const bounce = await app.inject({
      method: 'POST',
      url: `/v1/payments/${paymentId}/reverse`,
      headers: auth(adminToken),
      payload: { type: 'bounce', reason: 'insufficient funds' },
    });
    expect(bounce.statusCode).toBe(200);
    expect(bounce.json().data.payment.status).toBe('bounced');

    const after = await app.inject({
      method: 'GET',
      url: `/v1/students/${rStudent}/fees`,
      headers: auth(adminToken),
    });
    expect(after.json().data.totalOutstanding).toBe(17000); // fully restored
  });

  it('cannot reverse an already-reversed payment → 409', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/payments/${paymentId}/reverse`,
      headers: auth(adminToken),
      payload: { type: 'refund' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('refund reverses a completed payment', async () => {
    const pay = await app.inject({
      method: 'POST',
      url: `/v1/students/${rStudent}/payments`,
      headers: auth(adminToken),
      payload: { amount: 2000, method: 'cash' },
    });
    const refund = await app.inject({
      method: 'POST',
      url: `/v1/payments/${pay.json().data.payment.id}/reverse`,
      headers: auth(adminToken),
      payload: { type: 'refund' },
    });
    expect(refund.json().data.payment.status).toBe('refunded');
    const after = await app.inject({
      method: 'GET',
      url: `/v1/students/${rStudent}/fees`,
      headers: auth(adminToken),
    });
    expect(after.json().data.totalOutstanding).toBe(17000);
  });
});

describe('fee reports (P2-MOD-11)', () => {
  it('summary reports billed / collected / outstanding / efficiency / defaulters', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/fees/reports/summary',
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.billed).toBeGreaterThan(0);
    // Identity always holds: outstanding = billed - discount - collected.
    expect(d.outstanding).toBe(d.billed - d.discount - d.collected);
    expect(d.defaulters).toBeGreaterThanOrEqual(1);
    expect(d.collectionEfficiency).toBeGreaterThanOrEqual(0);
  });

  it('collection report totals completed payments by method and day', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/fees/reports/collection?from=2020-01-01&to=2035-12-31',
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.total).toBeGreaterThan(0);
    expect(Array.isArray(d.byMethod)).toBe(true);
    expect(d.byMethod.some((m: { method: string }) => m.method === 'cash')).toBe(true);
  });

  it('head-wise report groups dues by head', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/fees/reports/heads',
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const heads = res.json().data.map((h: { head: string }) => h.head);
    expect(heads).toContain('Tuition');
    expect(heads).toContain('Admission');
  });
});

describe('defaulters + reminders (P2-MOD-10)', () => {
  it('lists defaulters above a threshold', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/fees/reports/defaulters?minAmount=1000',
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const rows = res.json().data as Array<{ outstanding: number }>;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((d) => d.outstanding > 1000)).toBe(true);
    // Sorted descending by outstanding.
    expect(rows).toEqual([...rows].sort((a, b) => b.outstanding - a.outstanding));
  });

  it('sends overdue reminders to defaulters with a linked parent (outbox event)', async () => {
    // Give the mid-year student a parent with a phone so a reminder can fire.
    const parentId = (
      await app.inject({
        method: 'POST',
        url: '/v1/parents',
        headers: auth(adminToken),
        payload: { firstName: 'Payer', phone: '555-0777' },
      })
    ).json().data.id;
    // studentA still owes 0 (paid in full); use a fresh owing student with a parent.
    const owing = (
      await app.inject({
        method: 'POST',
        url: '/v1/students',
        headers: auth(adminToken),
        payload: {
          branchId,
          admissionNumber: `FDEF-${suffix}`,
          firstName: 'Owing',
          currentClassId: classId,
          admissionDate: '2026-04-01',
        },
      })
    ).json().data.id;
    await app.inject({
      method: 'POST',
      url: `/v1/fee-structures/${structureId}/allocate`,
      headers: auth(adminToken),
    });
    await app.inject({
      method: 'POST',
      url: `/v1/students/${owing}/parents`,
      headers: auth(adminToken),
      payload: { parentId, isPrimaryContact: true },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/fees/reminders/send',
      headers: auth(adminToken),
      payload: { minAmount: 1000 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.reminded).toBeGreaterThanOrEqual(1);

    const [event] = await adminDb
      .select()
      .from(outboxEvents)
      .where(
        and(eq(outboxEvents.aggregateId, owing), eq(outboxEvents.eventType, 'fee.payment.overdue')),
      );
    expect(event).toBeTruthy();
    expect((event!.payload as { recipients: Array<{ phone?: string }> }).recipients[0]!.phone).toBe(
      '555-0777',
    );
  });
});
