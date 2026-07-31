/**
 * Payment gateway (P2-MOD-08) — order creation + Razorpay webhook settlement.
 * Runs offline: no live Razorpay. We set a webhook secret and sign the payload
 * ourselves, exercising HMAC verification, idempotency, and cross-tenant
 * settlement via withTenant(). Live order creation (keys set) is not exercised.
 */
import { createHmac } from 'node:crypto';
import { createDb, createPool, tenants, users, userTenantRoles } from '@schoolmate/db';
import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const WH_SECRET = 'whsec_test_p2mod08';
const ADMIN_URL =
  process.env.DATABASE_URL ?? 'postgres://schoolmate:schoolmate_dev@localhost:5432/schoolmate';

let app: FastifyInstance;
const adminPool = createPool(ADMIN_URL);
const adminDb = createDb(adminPool);

const suffix = Date.now().toString(36);
const SLUG = `pay-${suffix}`;
const ADMIN_EMAIL = `payadmin-${suffix}@test.dev`;
const PASSWORD = 'pw-12345678';

let tenantId: string;
let branchId: string;
let studentId: string;
let adminToken: string;

const auth = () => ({ 'x-tenant-slug': SLUG, authorization: `Bearer ${adminToken}` });
const sign = (raw: string) => createHmac('sha256', WH_SECRET).update(raw).digest('hex');

beforeAll(async () => {
  // Must be set before app/env is first imported in this file.
  process.env.RAZORPAY_WEBHOOK_SECRET = WH_SECRET;
  const { buildApp } = await import('./app.js');

  const [t] = await adminDb
    .insert(tenants)
    .values({ name: 'Pay Test', slug: SLUG, subscriptionStatus: 'active' })
    .returning();
  tenantId = t!.id;
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const [u] = await adminDb
    .insert(users)
    .values({ email: ADMIN_EMAIL, passwordHash, status: 'active' })
    .returning();
  await adminDb
    .insert(userTenantRoles)
    .values({ userId: u!.id, tenantId, role: 'tenant_admin', isPrimaryRole: true });

  app = await buildApp();
  await app.ready();
  adminToken = (
    await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'x-tenant-slug': SLUG },
      payload: { email: ADMIN_EMAIL, password: PASSWORD },
    })
  ).json().data.accessToken;
  branchId = (
    await app.inject({
      method: 'POST',
      url: '/v1/branches',
      headers: auth(),
      payload: { name: 'Main', code: 'MAIN' },
    })
  ).json().data.id;
  studentId = (
    await app.inject({
      method: 'POST',
      url: '/v1/students',
      headers: auth(),
      payload: { branchId, admissionNumber: `PAY-${suffix}`, firstName: 'Otto' },
    })
  ).json().data.id;
});

afterAll(async () => {
  await adminDb.execute(sql`DELETE FROM tenants WHERE id = ${tenantId}`);
  await adminDb.execute(sql`DELETE FROM users WHERE email = ${ADMIN_EMAIL}`);
  await app.close();
  await adminPool.end();
});

describe('payment gateway: orders + webhook (P2-MOD-08)', () => {
  let orderId: string;

  it('creates a payment order (manual mode → local order id)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/students/${studentId}/payment-orders`,
      headers: auth(),
      payload: { amount: 250000 },
    });
    expect(res.statusCode).toBe(201);
    const data = res.json().data;
    expect(data.orderId).toMatch(/^order_local_/);
    expect(data.amount).toBe(250000);
    expect(data.currency).toBe('INR');
    orderId = data.orderId;
  });

  const captureEvent = () =>
    JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: `pay_${suffix}`,
            order_id: orderId,
            notes: { tenantId, studentId },
          },
        },
      },
    });

  it('rejects a webhook with a bad signature → 401', async () => {
    const raw = captureEvent();
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: { 'content-type': 'application/json', 'x-razorpay-signature': 'deadbeef' },
      payload: raw,
    });
    expect(res.statusCode).toBe(401);
  });

  it('settles a captured payment on a valid signature', async () => {
    const raw = captureEvent();
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: { 'content-type': 'application/json', 'x-razorpay-signature': sign(raw) },
      payload: raw,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('settled');

    // A fee_payment now exists for the student (method online).
    const fees = await app.inject({
      method: 'GET',
      url: `/v1/students/${studentId}/fees`,
      headers: auth(),
    });
    const payments = fees.json().data.payments as Array<{ amount: number; method: string }>;
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ amount: 250000, method: 'online' });
  });

  it('is idempotent — a replayed webhook does not double-settle', async () => {
    const raw = captureEvent();
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: { 'content-type': 'application/json', 'x-razorpay-signature': sign(raw) },
      payload: raw,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('already_processed');

    const fees = await app.inject({
      method: 'GET',
      url: `/v1/students/${studentId}/fees`,
      headers: auth(),
    });
    expect(fees.json().data.payments).toHaveLength(1); // still one
  });

  it('acknowledges non-captured events without settling', async () => {
    const raw = JSON.stringify({ event: 'payment.authorized', payload: {} });
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: { 'content-type': 'application/json', 'x-razorpay-signature': sign(raw) },
      payload: raw,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.ignored).toBe('payment.authorized');
  });
});
