/**
 * Students + Parents (P1-MOD-08/09/11/13/15) — live Postgres + Redis.
 * Verifies: student CRUD, govt-ID encryption at rest, masking vs decrypt by
 * permission, parent linking, and sibling detection via shared parents.
 */
import {
  createDb,
  createPool,
  students as studentsTable,
  tenants,
  users,
  userTenantRoles,
} from '@schoolmate/db';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

const ADMIN_URL =
  process.env.DATABASE_URL ?? 'postgres://schoolmate:schoolmate_dev@localhost:5433/schoolmate';

let app: FastifyInstance;
const adminPool = createPool(ADMIN_URL);
const adminDb = createDb(adminPool);

const suffix = Date.now().toString(36);
const SLUG = `stutest-${suffix}`;
const ADMIN_EMAIL = `stuadmin-${suffix}@test.dev`;
const CLERK_EMAIL = `stuclerk-${suffix}@test.dev`; // custom role: student.view only
const PASSWORD = 'pw-12345678';

let tenantId: string;
let branchId: string;
let adminToken: string;
let viewerToken: string;

const auth = (token: string) => ({ 'x-tenant-slug': SLUG, authorization: `Bearer ${token}` });

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
  const [t] = await adminDb
    .insert(tenants)
    .values({ name: 'Student Test', slug: SLUG, subscriptionStatus: 'active' })
    .returning();
  tenantId = t!.id;

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const inserted = await adminDb
    .insert(users)
    .values([
      { email: ADMIN_EMAIL, passwordHash, status: 'active' },
      { email: CLERK_EMAIL, passwordHash, status: 'active' },
    ])
    .returning();
  await adminDb.insert(userTenantRoles).values([
    { userId: inserted[0]!.id, tenantId, role: 'tenant_admin', isPrimaryRole: true },
    // Custom role: can view students but NOT decrypt sensitive fields.
    {
      userId: inserted[1]!.id,
      tenantId,
      role: 'custom',
      permissions: ['student.view'],
      isPrimaryRole: true,
    },
  ]);

  app = await buildApp();
  await app.ready();
  adminToken = await login(ADMIN_EMAIL);
  viewerToken = await login(CLERK_EMAIL);

  const b = await app.inject({
    method: 'POST',
    url: '/v1/branches',
    headers: auth(adminToken),
    payload: { name: 'Main', code: 'MAIN' },
  });
  branchId = b.json().data.id;
});

afterAll(async () => {
  await adminDb.execute(sql`DELETE FROM tenants WHERE id = ${tenantId}`);
  await adminDb.execute(sql`DELETE FROM users WHERE email IN (${ADMIN_EMAIL}, ${CLERK_EMAIL})`);
  await app.close();
  await adminPool.end();
});

const newStudent = (over: Record<string, unknown> = {}) => ({
  branchId,
  admissionNumber: `ADM-${Math.random().toString(36).slice(2, 8)}`,
  firstName: 'Test',
  lastName: 'Student',
  ...over,
});

describe('student CRUD + govt-ID encryption (P1-MOD-09/11)', () => {
  let studentId: string;

  it('creates a student with a govt ID → stored encrypted, returned masked to admin without sensitive perm', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/students',
      headers: auth(adminToken),
      payload: newStudent({ firstName: 'Bart', govtId: '123456789012' }),
    });
    expect(res.statusCode).toBe(201);
    studentId = res.json().data.id;
    // tenant_admin has '*' which includes student.view_sensitive → full value.
    expect(res.json().data.govtId).toBe('123456789012');
    expect(res.json().data.govtIdEncrypted).toBeUndefined();
  });

  it('persists ciphertext, never plaintext, in the DB', async () => {
    const [row] = await adminDb.select().from(studentsTable).where(eq(studentsTable.id, studentId));
    expect(row!.govtIdEncrypted).toBeTruthy();
    expect(row!.govtIdEncrypted).not.toContain('123456789012');
    expect(row!.govtIdEncrypted!.startsWith('v1:')).toBe(true);
  });

  it('masks the govt ID for a viewer lacking student.view_sensitive', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/students/${studentId}`,
      headers: auth(viewerToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.govtId).toBe('••••••••9012');
  });

  it('lists students filtered by branch', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/students?branchId=${branchId}`,
      headers: auth(adminToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().meta.total).toBeGreaterThanOrEqual(1);
  });

  it('rejects duplicate admission number → 409', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/v1/students',
      headers: auth(adminToken),
      payload: newStudent({ admissionNumber: 'DUP-1' }),
    });
    expect(first.statusCode).toBe(201);
    const dup = await app.inject({
      method: 'POST',
      url: '/v1/students',
      headers: auth(adminToken),
      payload: newStudent({ admissionNumber: 'DUP-1' }),
    });
    expect(dup.statusCode).toBe(409);
  });
});

describe('parent linking + sibling detection (P1-MOD-13/15)', () => {
  it('links two students to the same parent → each sees the other as sibling', async () => {
    const s1 = (
      await app.inject({
        method: 'POST',
        url: '/v1/students',
        headers: auth(adminToken),
        payload: newStudent({ firstName: 'Lisa' }),
      })
    ).json().data.id;
    const s2 = (
      await app.inject({
        method: 'POST',
        url: '/v1/students',
        headers: auth(adminToken),
        payload: newStudent({ firstName: 'Maggie' }),
      })
    ).json().data.id;

    const parentId = (
      await app.inject({
        method: 'POST',
        url: '/v1/parents',
        headers: auth(adminToken),
        payload: { firstName: 'Marge', relation: 'mother', phone: '555-0100' },
      })
    ).json().data.id;

    for (const sid of [s1, s2]) {
      const link = await app.inject({
        method: 'POST',
        url: `/v1/students/${sid}/parents`,
        headers: auth(adminToken),
        payload: { parentId, relation: 'mother', isPrimaryContact: true },
      });
      expect(link.statusCode).toBe(201);
    }

    const siblings = await app.inject({
      method: 'GET',
      url: `/v1/students/${s1}/siblings`,
      headers: auth(adminToken),
    });
    expect(siblings.statusCode).toBe(200);
    const ids = siblings.json().data.map((s: { id: string }) => s.id);
    expect(ids).toContain(s2);
    expect(ids).not.toContain(s1);

    // Linked parents are listed with join data.
    const linkedParents = await app.inject({
      method: 'GET',
      url: `/v1/students/${s1}/parents`,
      headers: auth(adminToken),
    });
    expect(linkedParents.json().data[0].parent.firstName).toBe('Marge');
  });

  it('a student with no parents has no siblings', async () => {
    const lone = (
      await app.inject({
        method: 'POST',
        url: '/v1/students',
        headers: auth(adminToken),
        payload: newStudent({ firstName: 'Nelson' }),
      })
    ).json().data.id;
    const res = await app.inject({
      method: 'GET',
      url: `/v1/students/${lone}/siblings`,
      headers: auth(adminToken),
    });
    expect(res.json().data).toEqual([]);
  });
});
