/**
 * Platform super-admin API (P1-MOD-01) — live Postgres + Redis.
 * Verifies platform-login (is_platform_admin gate), the tenant registry
 * endpoints, and that a tenant_admin '*' token cannot reach /platform.
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
const SLUG = `plat-${suffix}`;
const PLATFORM_EMAIL = `platadmin-${suffix}@test.dev`;
const TENANT_ADMIN_EMAIL = `platttenant-${suffix}@test.dev`;
const NEW_SLUG = `newtenant-${suffix}`;
const PASSWORD = 'pw-12345678';

let tenantId: string;
let platformToken: string;
let tenantAdminToken: string;

beforeAll(async () => {
  const [t] = await adminDb
    .insert(tenants)
    .values({ name: 'Platform Test Tenant', slug: SLUG, subscriptionStatus: 'active' })
    .returning();
  tenantId = t!.id;
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const ins = await adminDb
    .insert(users)
    .values([
      { email: PLATFORM_EMAIL, passwordHash, status: 'active', isPlatformAdmin: true },
      { email: TENANT_ADMIN_EMAIL, passwordHash, status: 'active' },
    ])
    .returning();
  await adminDb
    .insert(userTenantRoles)
    .values({ userId: ins[1]!.id, tenantId, role: 'tenant_admin', isPrimaryRole: true });

  app = await buildApp();
  await app.ready();

  platformToken = (
    await app.inject({
      method: 'POST',
      url: '/auth/platform-login',
      payload: { email: PLATFORM_EMAIL, password: PASSWORD },
    })
  ).json().data.accessToken;
  tenantAdminToken = (
    await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'x-tenant-slug': SLUG },
      payload: { email: TENANT_ADMIN_EMAIL, password: PASSWORD },
    })
  ).json().data.accessToken;
});

afterAll(async () => {
  await adminDb.execute(sql`DELETE FROM tenants WHERE slug IN (${SLUG}, ${NEW_SLUG})`);
  await adminDb.execute(
    sql`DELETE FROM users WHERE email IN (${PLATFORM_EMAIL}, ${TENANT_ADMIN_EMAIL})`,
  );
  await app.close();
  await adminPool.end();
});

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

describe('platform login (P1-MOD-01)', () => {
  it('issues a super_admin session for a platform admin', () => {
    expect(platformToken).toBeTruthy();
  });

  it('rejects a non-platform user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/platform-login',
      payload: { email: TENANT_ADMIN_EMAIL, password: PASSWORD },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('platform tenant registry (P1-MOD-01)', () => {
  it('lists tenants for a super admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/platform/tenants',
      headers: bearer(platformToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().meta.total).toBeGreaterThanOrEqual(1);
  });

  it('creates a tenant seeded from its institute-type preset', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/platform/tenants',
      headers: bearer(platformToken),
      payload: { name: 'New Academy', slug: NEW_SLUG, instituteType: 'college' },
    });
    expect(res.statusCode).toBe(201);
    const t = res.json().data;
    expect(t.instituteType).toBe('college');
    // College preset terminology: a class is a "Course".
    expect(t.config.terminology.class).toBe('Course');
    expect(t.config.modules).toContain('exams');
  });

  it('rejects a duplicate slug → 409', async () => {
    const dup = await app.inject({
      method: 'POST',
      url: '/platform/tenants',
      headers: bearer(platformToken),
      payload: { name: 'Dupe', slug: NEW_SLUG },
    });
    expect(dup.statusCode).toBe(409);
  });

  it('forbids a tenant_admin (even with *) from reaching /platform → 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/platform/tenants',
      headers: bearer(tenantAdminToken),
    });
    expect(res.statusCode).toBe(403);
  });

  it('requires authentication → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/platform/tenants' });
    expect(res.statusCode).toBe(401);
  });
});
