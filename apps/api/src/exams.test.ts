/**
 * Examinations — grading systems (P2-MOD-13) — live Postgres + Redis.
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
const SLUG = `exam-${suffix}`;
const ADMIN_EMAIL = `examadmin-${suffix}@test.dev`;
const PASSWORD = 'pw-12345678';

let tenantId: string;
let branchId: string;
let adminToken: string;

const auth = () => ({ 'x-tenant-slug': SLUG, authorization: `Bearer ${adminToken}` });

beforeAll(async () => {
  const [t] = await adminDb
    .insert(tenants)
    .values({ name: 'Exam Test', slug: SLUG, subscriptionStatus: 'active' })
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

describe('grading systems (P2-MOD-13)', () => {
  it('serves presets including CBSE', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/grading-systems/presets',
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    const keys = res.json().data.map((p: { key: string }) => p.key);
    expect(keys).toEqual(expect.arrayContaining(['cbse', 'gpa4', 'percentage']));
  });

  it('creates a grading system from a preset', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/grading-systems/from-preset',
      headers: auth(),
      payload: { branchId, preset: 'cbse' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.type).toBe('letter');
    expect(res.json().data.scale.length).toBe(8);
  });

  it('creates a custom scale and lists it', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/grading-systems',
      headers: auth(),
      payload: {
        branchId,
        name: 'Custom Pass/Fail',
        type: 'percentage',
        scale: [
          { grade: 'P', min: 40, max: 100, points: 1 },
          { grade: 'F', min: 0, max: 39, points: 0 },
        ],
      },
    });
    expect(res.statusCode).toBe(201);

    const list = await app.inject({
      method: 'GET',
      url: `/v1/grading-systems?branchId=${branchId}`,
      headers: auth(),
    });
    expect(list.json().data.length).toBeGreaterThanOrEqual(2);
  });
});

describe('exam scheduling + datesheet (P2-MOD-14)', () => {
  let sessionId: string;
  let classId: string;
  let subj1: string;
  let subj2: string;
  let examId: string;

  it('sets up session, class and subjects', async () => {
    sessionId = (
      await app.inject({
        method: 'POST',
        url: '/v1/academic-sessions',
        headers: auth(),
        payload: { branchId, name: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31' },
      })
    ).json().data.id;
    classId = (
      await app.inject({
        method: 'POST',
        url: '/v1/classes',
        headers: auth(),
        payload: { branchId, name: 'Grade 5', classType: 'middle' },
      })
    ).json().data.id;
    subj1 = (
      await app.inject({
        method: 'POST',
        url: '/v1/subjects',
        headers: auth(),
        payload: { branchId, name: 'Math', code: `M-${suffix}` },
      })
    ).json().data.id;
    subj2 = (
      await app.inject({
        method: 'POST',
        url: '/v1/subjects',
        headers: auth(),
        payload: { branchId, name: 'Science', code: `S-${suffix}` },
      })
    ).json().data.id;
    expect(subj1 && subj2).toBeTruthy();
  });

  it('creates an exam type and an exam', async () => {
    const type = await app.inject({
      method: 'POST',
      url: '/v1/exam-types',
      headers: auth(),
      payload: { branchId, name: 'Term 1', weightage: 50 },
    });
    expect(type.statusCode).toBe(201);

    const exam = await app.inject({
      method: 'POST',
      url: '/v1/exams',
      headers: auth(),
      payload: {
        branchId,
        academicSessionId: sessionId,
        classId,
        examTypeId: type.json().data.id,
        name: 'Term 1 Exam',
      },
    });
    expect(exam.statusCode).toBe(201);
    examId = exam.json().data.id;
  });

  it('builds a datesheet and rejects a same-day clash', async () => {
    const p1 = await app.inject({
      method: 'POST',
      url: `/v1/exams/${examId}/subjects`,
      headers: auth(),
      payload: { subjectId: subj1, examDate: '2026-12-01', maxMarks: 100, passMarks: 33 },
    });
    expect(p1.statusCode).toBe(201);

    const clash = await app.inject({
      method: 'POST',
      url: `/v1/exams/${examId}/subjects`,
      headers: auth(),
      payload: { subjectId: subj2, examDate: '2026-12-01' },
    });
    expect(clash.statusCode).toBe(409);

    const p2 = await app.inject({
      method: 'POST',
      url: `/v1/exams/${examId}/subjects`,
      headers: auth(),
      payload: { subjectId: subj2, examDate: '2026-12-03' },
    });
    expect(p2.statusCode).toBe(201);

    const detail = await app.inject({ method: 'GET', url: `/v1/exams/${examId}`, headers: auth() });
    expect(detail.json().data.datesheet).toHaveLength(2);
  });
});
