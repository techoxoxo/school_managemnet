/**
 * Student documents (P1-MOD-10) — live Postgres + Redis + MinIO.
 * Full flow: presigned upload → record → checklist → download → verify →
 * delete. Skipped when MinIO is unreachable (not wired into CI services).
 */
import { createDb, createPool, tenants, users, userTenantRoles } from '@schoolmate/db';
import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

const MINIO_HEALTH = 'http://127.0.0.1:9000/minio/health/live';
const MINIO_UP = await fetch(MINIO_HEALTH)
  .then((r) => r.ok)
  .catch(() => false);
if (!MINIO_UP) console.warn('[documents.test] MinIO not reachable — skipping P1-MOD-10 tests');

const ADMIN_URL =
  process.env.DATABASE_URL ?? 'postgres://schoolmate:schoolmate_dev@localhost:5433/schoolmate';

let app: FastifyInstance;
const adminPool = createPool(ADMIN_URL);
const adminDb = createDb(adminPool);

const suffix = Date.now().toString(36);
const SLUG = `doc-${suffix}`;
const ADMIN_EMAIL = `docadmin-${suffix}@test.dev`;
const PASSWORD = 'pw-12345678';

let tenantId: string;
let branchId: string;
let studentId: string;
let adminToken: string;

const auth = () => ({ 'x-tenant-slug': SLUG, authorization: `Bearer ${adminToken}` });

describe.skipIf(!MINIO_UP)('student documents (P1-MOD-10)', () => {
  let docId: string;

  beforeAll(async () => {
    const [t] = await adminDb
      .insert(tenants)
      .values({ name: 'Doc Test', slug: SLUG, subscriptionStatus: 'active' })
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
        payload: { branchId, admissionNumber: `DOC-${suffix}`, firstName: 'Documented' },
      })
    ).json().data.id;
  });

  afterAll(async () => {
    await adminDb.execute(sql`DELETE FROM tenants WHERE id = ${tenantId}`);
    await adminDb.execute(sql`DELETE FROM users WHERE email = ${ADMIN_EMAIL}`);
    await app.close();
    await adminPool.end();
  });

  it('uploads via presigned URL, records the doc, and it appears in the checklist', async () => {
    const urlRes = await app.inject({
      method: 'POST',
      url: `/v1/students/${studentId}/documents/upload-url`,
      headers: auth(),
      payload: { docType: 'photo', fileName: 'photo.png' },
    });
    expect(urlRes.statusCode).toBe(200);
    const { uploadUrl, storageKey } = urlRes.json().data;
    expect(uploadUrl).toContain('http');

    // Actually PUT bytes to object storage via the presigned URL.
    const put = await fetch(uploadUrl, { method: 'PUT', body: Buffer.from('fake-png-bytes') });
    expect(put.ok).toBe(true);

    const rec = await app.inject({
      method: 'POST',
      url: `/v1/students/${studentId}/documents`,
      headers: auth(),
      payload: { docType: 'photo', fileName: 'photo.png', storageKey, contentType: 'image/png' },
    });
    expect(rec.statusCode).toBe(201);
    docId = rec.json().data.id;
    expect(rec.json().data.status).toBe('pending');

    const list = await app.inject({
      method: 'GET',
      url: `/v1/students/${studentId}/documents`,
      headers: auth(),
    });
    const { documents, checklist } = list.json().data;
    expect(documents).toHaveLength(1);
    const photo = checklist.find((c: { docType: string }) => c.docType === 'photo');
    expect(photo).toMatchObject({ present: true, required: true });
    const aadhaar = checklist.find((c: { docType: string }) => c.docType === 'aadhaar');
    expect(aadhaar).toMatchObject({ present: false });
  });

  it('returns a working download URL for the stored bytes', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/students/${studentId}/documents/${docId}/download-url`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    const dl = await fetch(res.json().data.downloadUrl);
    expect(dl.ok).toBe(true);
    expect(await dl.text()).toBe('fake-png-bytes');
  });

  it('runs the verification workflow', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/students/${studentId}/documents/${docId}/verify`,
      headers: auth(),
      payload: { status: 'verified', remarks: 'looks good' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('verified');
    expect(res.json().data.verifiedBy).toBeTruthy();
  });

  it('deletes the document', async () => {
    const del = await app.inject({
      method: 'DELETE',
      url: `/v1/students/${studentId}/documents/${docId}`,
      headers: auth(),
    });
    expect(del.statusCode).toBe(200);
    const list = await app.inject({
      method: 'GET',
      url: `/v1/students/${studentId}/documents`,
      headers: auth(),
    });
    expect(list.json().data.documents).toHaveLength(0);
  });
});
