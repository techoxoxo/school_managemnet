/**
 * Auth integration tests (P0-AUTH-01..06) — live Postgres + Redis.
 * Covers: login, lockout, refresh rotation + reuse detection, instant
 * revocation on logout, permission enforcement, password reset.
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
const SLUG = `authtest-${suffix}`;
const ADMIN_EMAIL = `admin-${suffix}@test.dev`;
const STUDENT_EMAIL = `student-${suffix}@test.dev`;
const LOCK_EMAIL = `lock-${suffix}@test.dev`;
const PASSWORD = 'correct-horse-9';

let tenantId: string;

const login = (email: string, password: string) =>
  app.inject({
    method: 'POST',
    url: '/auth/login',
    headers: { 'x-tenant-slug': SLUG },
    payload: { email, password },
  });

beforeAll(async () => {
  const [tenant] = await adminDb
    .insert(tenants)
    .values({ name: 'Auth Test', slug: SLUG, subscriptionStatus: 'active' })
    .returning();
  tenantId = tenant!.id;

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const inserted = await adminDb
    .insert(users)
    .values([
      { email: ADMIN_EMAIL, passwordHash, status: 'active' },
      { email: STUDENT_EMAIL, passwordHash, status: 'active' },
      { email: LOCK_EMAIL, passwordHash, status: 'active' },
    ])
    .returning();

  await adminDb.insert(userTenantRoles).values([
    { userId: inserted[0]!.id, tenantId, role: 'tenant_admin', isPrimaryRole: true },
    { userId: inserted[1]!.id, tenantId, role: 'student', isPrimaryRole: true },
    { userId: inserted[2]!.id, tenantId, role: 'teacher', isPrimaryRole: true },
  ]);

  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await adminDb.execute(sql`DELETE FROM tenants WHERE id = ${tenantId}`);
  await adminDb.execute(
    sql`DELETE FROM users WHERE email IN (${ADMIN_EMAIL}, ${STUDENT_EMAIL}, ${LOCK_EMAIL})`,
  );
  await app.close();
  await adminPool.end();
});

describe('login (P0-AUTH-01)', () => {
  it('valid credentials → tokens + role + permissions', async () => {
    const res = await login(ADMIN_EMAIL, PASSWORD);
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.accessToken).toBeTruthy();
    expect(data.refreshToken).toBeTruthy();
    expect(data.user.role).toBe('tenant_admin');
    expect(data.user.permissions).toContain('*');
  });

  it('wrong password → 401 INVALID_CREDENTIALS (no enumeration)', async () => {
    const res = await login(ADMIN_EMAIL, 'wrong');
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('unknown email → same 401 shape', async () => {
    const res = await login(`ghost-${suffix}@test.dev`, 'whatever');
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('lockout (P0-AUTH-03)', () => {
  it('locks the account after 5 failed attempts', async () => {
    for (let i = 0; i < 5; i++) await login(LOCK_EMAIL, 'bad-password');
    const res = await login(LOCK_EMAIL, PASSWORD);
    expect(res.statusCode).toBe(423);
    expect(res.json().error.code).toBe('ACCOUNT_LOCKED');
  });
});

describe('refresh rotation (P0-AUTH-02)', () => {
  it('rotates the refresh token; the old one dies; reuse kills the session', async () => {
    const loginRes = await login(ADMIN_EMAIL, PASSWORD);
    const { refreshToken } = loginRes.json().data;

    const refresh = (token: string) =>
      app.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: { 'x-tenant-slug': SLUG },
        payload: { refreshToken: token },
      });

    const first = await refresh(refreshToken);
    expect(first.statusCode).toBe(200);
    const rotated = first.json().data.refreshToken;
    expect(rotated).not.toBe(refreshToken);

    // Reusing the consumed token → rejected AND the session is destroyed.
    const reuse = await refresh(refreshToken);
    expect(reuse.statusCode).toBe(401);
    const afterTheft = await refresh(rotated);
    expect(afterTheft.statusCode).toBe(401);
  });
});

describe('logout & instant revocation (P0-AUTH-02)', () => {
  it('logout kills the session; access token stops working immediately', async () => {
    const loginRes = await login(ADMIN_EMAIL, PASSWORD);
    const { accessToken } = loginRes.json().data;
    const authed = { 'x-tenant-slug': SLUG, authorization: `Bearer ${accessToken}` };

    const meBefore = await app.inject({ method: 'GET', url: '/auth/me', headers: authed });
    expect(meBefore.statusCode).toBe(200);

    const out = await app.inject({ method: 'POST', url: '/auth/logout', headers: authed });
    expect(out.statusCode).toBe(200);

    const meAfter = await app.inject({ method: 'GET', url: '/auth/me', headers: authed });
    expect(meAfter.statusCode).toBe(401);
    expect(meAfter.json().error.code).toBe('TOKEN_EXPIRED');
  });
});

describe('permission enforcement (P0-AUTH-05)', () => {
  it('no token → 401 on guarded route', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/branches',
      headers: { 'x-tenant-slug': SLUG },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('student (no branch.view) → 403 PERMISSION_DENIED', async () => {
    const loginRes = await login(STUDENT_EMAIL, PASSWORD);
    const { accessToken } = loginRes.json().data;
    const res = await app.inject({
      method: 'GET',
      url: '/v1/branches',
      headers: { 'x-tenant-slug': SLUG, authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('PERMISSION_DENIED');
  });

  it('tenant_admin → 200', async () => {
    const loginRes = await login(ADMIN_EMAIL, PASSWORD);
    const { accessToken } = loginRes.json().data;
    const res = await app.inject({
      method: 'GET',
      url: '/v1/branches',
      headers: { 'x-tenant-slug': SLUG, authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('password reset (P0-AUTH-04)', () => {
  it('full flow: forgot → token → reset → old sessions dead → new password works', async () => {
    const loginRes = await login(ADMIN_EMAIL, PASSWORD);
    const { accessToken } = loginRes.json().data;

    const forgot = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      headers: { 'x-tenant-slug': SLUG },
      payload: { email: ADMIN_EMAIL },
    });
    expect(forgot.statusCode).toBe(200);

    // Fetch the token straight from Redis (email dispatch lands in P1-API-02).
    const keys = await app.redis.keys('pwreset:*');
    expect(keys.length).toBeGreaterThan(0);
    const token = keys[keys.length - 1]!.replace('pwreset:', '');

    const newPassword = 'brand-new-pass-1';
    const reset = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      headers: { 'x-tenant-slug': SLUG },
      payload: { token, newPassword },
    });
    expect(reset.statusCode).toBe(200);

    // All prior sessions terminated by the reset.
    const meAfter = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { 'x-tenant-slug': SLUG, authorization: `Bearer ${accessToken}` },
    });
    expect(meAfter.statusCode).toBe(401);

    expect((await login(ADMIN_EMAIL, PASSWORD)).statusCode).toBe(401);
    expect((await login(ADMIN_EMAIL, newPassword)).statusCode).toBe(200);
  });
});
