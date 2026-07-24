/**
 * Bulk import v1 (P1-MOD-16) — live Postgres + Redis.
 * Dry-run validation (bad rows, in-file dups, existing admission numbers),
 * all-or-nothing staged commit tagged with a batch, and rollback-by-batch.
 */
import {
  createDb,
  createPool,
  importBatches,
  students,
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
const SLUG = `imp-${suffix}`;
const ADMIN_EMAIL = `impadmin-${suffix}@test.dev`;
const PASSWORD = 'pw-12345678';

let tenantId: string;
let branchId: string;
let adminToken: string;
let batchId: string;

const auth = () => ({ 'x-tenant-slug': SLUG, authorization: `Bearer ${adminToken}` });

beforeAll(async () => {
  const [t] = await adminDb
    .insert(tenants)
    .values({ name: 'Import Test', slug: SLUG, subscriptionStatus: 'active' })
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
});

afterAll(async () => {
  await adminDb.execute(sql`DELETE FROM tenants WHERE id = ${tenantId}`);
  await adminDb.execute(sql`DELETE FROM users WHERE email = ${ADMIN_EMAIL}`);
  await app.close();
  await adminPool.end();
});

const importStudents = (body: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/v1/imports/students', headers: auth(), payload: body });

describe('bulk import: template + dry-run (P1-MOD-16)', () => {
  it('serves the column template', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/imports/students/template',
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    const fields = res.json().data.columns.map((c: { field: string }) => c.field);
    expect(fields).toContain('admissionNumber');
    expect(fields).toContain('parentPhone');
  });

  it('dry-run flags bad rows, in-file dups, and existing admission numbers', async () => {
    // Pre-existing student to collide with.
    await app.inject({
      method: 'POST',
      url: '/v1/students',
      headers: auth(),
      payload: { branchId, admissionNumber: `EXIST-${suffix}`, firstName: 'There' },
    });

    const res = await importStudents({
      branchId,
      dryRun: true,
      rows: [
        { admissionNumber: `OK-${suffix}`, firstName: 'Ann' }, // valid
        { admissionNumber: `BAD-${suffix}` }, // missing firstName
        { admissionNumber: `DUP-${suffix}`, firstName: 'X' },
        { admissionNumber: `DUP-${suffix}`, firstName: 'Y' }, // in-file dup
        { admissionNumber: `EXIST-${suffix}`, firstName: 'Z' }, // already exists
      ],
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.total).toBe(5);
    expect(d.valid).toBe(2); // OK + first DUP
    expect(d.invalid).toBe(3);
    // no rows should have been written
    const rows = await adminDb.select().from(students).where(eq(students.tenantId, tenantId));
    expect(rows.length).toBe(1); // only the pre-existing EXIST student
  });
});

describe('bulk import: commit + rollback (P1-MOD-16)', () => {
  it('refuses to commit a batch with any invalid row → 422', async () => {
    const res = await importStudents({
      branchId,
      dryRun: false,
      rows: [
        { admissionNumber: `C-${suffix}-1`, firstName: 'Good' },
        { admissionNumber: `C-${suffix}-2` }, // bad
      ],
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().data.committed).toBe(false);
  });

  it('commits a clean batch (students + linked parents) with a batch tag', async () => {
    const res = await importStudents({
      branchId,
      tag: 'Jan intake',
      dryRun: false,
      rows: [
        { admissionNumber: `I-${suffix}-1`, firstName: 'Lisa' },
        {
          admissionNumber: `I-${suffix}-2`,
          firstName: 'Bart',
          parentFirstName: 'Homer',
          parentPhone: '555-0100',
          parentRelation: 'father',
        },
      ],
    });
    expect(res.statusCode).toBe(201);
    const d = res.json().data;
    expect(d).toMatchObject({ committed: true, created: 2, parentsCreated: 1 });
    batchId = d.batchId;

    const tagged = await adminDb.select().from(students).where(eq(students.importBatchId, batchId));
    expect(tagged.length).toBe(2);

    const list = await app.inject({ method: 'GET', url: '/v1/imports', headers: auth() });
    expect(list.json().data.some((b: { id: string; tag: string }) => b.id === batchId)).toBe(true);
  });

  it('rolls back the whole batch by id', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/imports/${batchId}`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.studentsDeleted).toBe(2);

    const left = await adminDb.select().from(students).where(eq(students.importBatchId, batchId));
    expect(left.length).toBe(0);
    const batches = await adminDb.select().from(importBatches).where(eq(importBatches.id, batchId));
    expect(batches.length).toBe(0);
  });
});
