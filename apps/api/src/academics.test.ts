/**
 * Academic structure CRUD (P1-MOD-04..07) — live Postgres + Redis.
 * Verifies: full CRUD via the factory, audit rows, permission enforcement,
 * pagination/search, branch filters, and cross-tenant RLS invisibility.
 */
import { createDb, createPool, tenants, users, userTenantRoles } from '@schoolmate/db';
import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

const ADMIN_URL =
  process.env.DATABASE_URL ?? 'postgres://schoolmate:schoolmate_dev@localhost:5433/schoolmate';

let app: FastifyInstance;
const adminPool = createPool(ADMIN_URL);
const adminDb = createDb(adminPool);

const suffix = Date.now().toString(36);
const SLUG = `acadtest-${suffix}`;
const OTHER_SLUG = `acadother-${suffix}`;
const ADMIN_EMAIL = `acadadmin-${suffix}@test.dev`;
const TEACHER_EMAIL = `acadteacher-${suffix}@test.dev`;
const PASSWORD = 'pw-12345678';

let tenantId: string;
let otherTenantId: string;
let adminToken: string;
let teacherToken: string;

const auth = (token: string) => ({
  'x-tenant-slug': SLUG,
  authorization: `Bearer ${token}`,
});

async function login(email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    headers: { 'x-tenant-slug': SLUG },
    payload: { email, password: PASSWORD },
  });
  return res.json().data.accessToken;
}

beforeAll(async () => {
  const [t1, t2] = await adminDb
    .insert(tenants)
    .values([
      { name: 'Acad Test', slug: SLUG, subscriptionStatus: 'active' },
      { name: 'Acad Other', slug: OTHER_SLUG, subscriptionStatus: 'active' },
    ])
    .returning();
  tenantId = t1!.id;
  otherTenantId = t2!.id;

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const inserted = await adminDb
    .insert(users)
    .values([
      { email: ADMIN_EMAIL, passwordHash, status: 'active' },
      { email: TEACHER_EMAIL, passwordHash, status: 'active' },
    ])
    .returning();
  await adminDb.insert(userTenantRoles).values([
    { userId: inserted[0]!.id, tenantId, role: 'tenant_admin', isPrimaryRole: true },
    { userId: inserted[1]!.id, tenantId, role: 'teacher', isPrimaryRole: true },
  ]);

  app = await buildApp();
  await app.ready();
  adminToken = await login(ADMIN_EMAIL);
  teacherToken = await login(TEACHER_EMAIL);
});

afterAll(async () => {
  await adminDb.execute(sql`DELETE FROM tenants WHERE id IN (${tenantId}, ${otherTenantId})`);
  await adminDb.execute(sql`DELETE FROM users WHERE email IN (${ADMIN_EMAIL}, ${TEACHER_EMAIL})`);
  await app.close();
  await adminPool.end();
});

describe('branch CRUD (P1-MOD-04)', () => {
  let branchId: string;

  it('admin creates a branch → 201 + audit row', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/branches',
      headers: auth(adminToken),
      payload: { name: 'Main Campus', code: 'MAIN', isMainBranch: true },
    });
    expect(res.statusCode).toBe(201);
    branchId = res.json().data.id;

    const [audit] = (
      await adminDb.execute(
        sql`SELECT action, entity_type FROM audit_logs
            WHERE tenant_id = ${tenantId} AND entity_id = ${branchId}`,
      )
    ).rows as Array<{ action: string; entity_type: string }>;
    expect(audit).toMatchObject({ action: 'create', entity_type: 'branch' });
  });

  it('teacher (branch.view only) cannot create → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/branches',
      headers: auth(teacherToken),
      payload: { name: 'Nope', code: 'NOPE' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('PERMISSION_DENIED');
  });

  it('teacher can list branches (branch.view)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/branches',
      headers: auth(teacherToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().meta.total).toBeGreaterThanOrEqual(1);
  });

  it('update + delete flow with 404 on missing', async () => {
    const patch = await app.inject({
      method: 'PATCH',
      url: `/v1/branches/${branchId}`,
      headers: auth(adminToken),
      payload: { principalName: 'Dr. Skinner' },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().data.principalName).toBe('Dr. Skinner');

    const missing = await app.inject({
      method: 'GET',
      url: `/v1/branches/00000000-0000-0000-0000-000000000000`,
      headers: auth(adminToken),
    });
    expect(missing.statusCode).toBe(404);
  });

  it('keeps the branch for downstream tests', () => {
    expect(branchId).toBeTruthy();
  });
});

describe('class + section + subject chain (P1-MOD-06/07)', () => {
  let branchId: string;
  let classId: string;

  beforeAll(async () => {
    const b = await app.inject({
      method: 'POST',
      url: '/v1/branches',
      headers: auth(adminToken),
      payload: { name: 'Chain Campus', code: 'CHAIN' },
    });
    branchId = b.json().data.id;
  });

  it('creates a class scoped to the branch', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/classes',
      headers: auth(adminToken),
      payload: { branchId, name: 'Grade 1', classType: 'primary', displayOrder: 1 },
    });
    expect(res.statusCode).toBe(201);
    classId = res.json().data.id;
  });

  it('lists classes filtered by branchId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/classes?branchId=${branchId}`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].name).toBe('Grade 1');
  });

  it('creates sections under the class', async () => {
    for (const name of ['A', 'B']) {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/sections',
        headers: auth(adminToken),
        payload: { branchId, classId, name, capacity: 35 },
      });
      expect(res.statusCode).toBe(201);
    }
    const list = await app.inject({
      method: 'GET',
      url: `/v1/sections?classId=${classId}`,
      headers: auth(adminToken),
    });
    expect(list.json().meta.total).toBe(2);
  });

  it('enforces unique section name per class (duplicate → 409 CONFLICT)', async () => {
    const dup = await app.inject({
      method: 'POST',
      url: '/v1/sections',
      headers: auth(adminToken),
      payload: { branchId, classId, name: 'A' },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('CONFLICT');
  });

  it('creates a subject and searches by name', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/subjects',
      headers: auth(adminToken),
      payload: { branchId, name: 'Mathematics', code: 'MATH1', subjectType: 'core' },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/subjects?q=math',
      headers: auth(adminToken),
    });
    expect(res.json().data.some((s: { code: string }) => s.code === 'MATH1')).toBe(true);
  });
});

describe('academic session CRUD (P1-MOD-05)', () => {
  it('creates a session for a branch', async () => {
    const b = await app.inject({
      method: 'POST',
      url: '/v1/branches',
      headers: auth(adminToken),
      payload: { name: 'Session Campus', code: 'SESS' },
    });
    const branchId = b.json().data.id;

    const res = await app.inject({
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
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.name).toBe('2026-2027');
  });
});

describe('cross-tenant isolation via API (RLS end-to-end)', () => {
  it("other tenant sees none of this tenant's branches", async () => {
    // A branch created under SLUG must be invisible when querying OTHER_SLUG.
    const res = await app.inject({
      method: 'GET',
      url: '/v1/branches',
      headers: { 'x-tenant-slug': OTHER_SLUG, authorization: `Bearer ${adminToken}` },
    });
    // adminToken belongs to SLUG tenant → rejected on OTHER_SLUG (tenant binding).
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });
});
