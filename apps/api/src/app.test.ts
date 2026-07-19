/**
 * API integration tests — run against live Postgres + Redis (docker compose / CI services).
 * Proves the P0 pipeline: tenant resolution → RLS-scoped query → response envelope.
 */
import { createDb, createPool, branches, tenants } from '@schoolmate/db';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

const ADMIN_URL =
  process.env.DATABASE_URL ?? 'postgres://schoolmate:schoolmate_dev@localhost:5433/schoolmate';

let app: FastifyInstance;
const adminPool = createPool(ADMIN_URL);
const adminDb = createDb(adminPool);

const suffix = Date.now().toString(36);
const SLUG_A = `apitest-a-${suffix}`;
const SLUG_B = `apitest-b-${suffix}`;
let tenantAId: string;
let tenantBId: string;

beforeAll(async () => {
  const rows = await adminDb
    .insert(tenants)
    .values([
      { name: 'API Test A', slug: SLUG_A, subscriptionStatus: 'active' },
      { name: 'API Test B', slug: SLUG_B, subscriptionStatus: 'suspended' },
    ])
    .returning();
  tenantAId = rows[0]!.id;
  tenantBId = rows[1]!.id;

  await adminDb.insert(branches).values([
    { tenantId: tenantAId, name: 'A Main', code: 'AM' },
    { tenantId: tenantBId, name: 'B Main', code: 'BM' },
  ]);

  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await adminDb.execute(sql`DELETE FROM tenants WHERE id IN (${tenantAId}, ${tenantBId})`);
  await app.close();
  await adminPool.end();
});

describe('health (public routes skip tenant resolution)', () => {
  it('GET /health → ok without tenant header', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });

  it('GET /ready → checks database and redis', async () => {
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ready', checks: { database: 'ok', redis: 'ok' } });
  });
});

describe('tenant resolution (P0-API-03)', () => {
  it('unknown slug → 404 TENANT_NOT_FOUND envelope', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/branches',
      headers: { 'x-tenant-slug': 'does-not-exist' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'TENANT_NOT_FOUND' } });
  });

  it('missing tenant → 400 envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/branches' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('TENANT_NOT_FOUND');
  });

  it('suspended tenant → 403 TENANT_SUSPENDED', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/branches',
      headers: { 'x-tenant-slug': SLUG_B },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('TENANT_SUSPENDED');
  });

  it('unknown route → 404 NOT_FOUND envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/nope', headers: {} });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});

describe('tenant-scoped data via RLS (P0-API-04)', () => {
  it('tenant A sees only its own branches — B is invisible', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/branches',
      headers: { 'x-tenant-slug': SLUG_A },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ name: 'A Main', code: 'AM' });
  });

  it('second call hits the Redis tenant cache (same result)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/branches',
      headers: { 'x-tenant-slug': SLUG_A },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });
});

describe('OpenAPI (P0-API-05)', () => {
  it('serves the generated spec', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.openapi).toBeDefined();
    expect(spec.paths['/v1/branches']).toBeDefined();
  });
});
