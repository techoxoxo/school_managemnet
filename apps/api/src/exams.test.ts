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

describe('marks entry + verification (P2-MOD-15/16)', () => {
  let esId: string;
  let s1: string;
  let s2: string;
  let teacherToken: string;

  beforeAll(async () => {
    const session = (
      await app.inject({
        method: 'POST',
        url: '/v1/academic-sessions',
        headers: auth(),
        payload: { branchId, name: 'M-2026', startDate: '2026-04-01', endDate: '2027-03-31' },
      })
    ).json().data.id;
    const klass = (
      await app.inject({
        method: 'POST',
        url: '/v1/classes',
        headers: auth(),
        payload: { branchId, name: 'Grade 8', classType: 'secondary' },
      })
    ).json().data.id;
    const subject = (
      await app.inject({
        method: 'POST',
        url: '/v1/subjects',
        headers: auth(),
        payload: { branchId, name: 'English', code: `E-${suffix}` },
      })
    ).json().data.id;
    const grading = (
      await app.inject({
        method: 'POST',
        url: '/v1/grading-systems/from-preset',
        headers: auth(),
        payload: { branchId, preset: 'cbse' },
      })
    ).json().data.id;
    const exam = (
      await app.inject({
        method: 'POST',
        url: '/v1/exams',
        headers: auth(),
        payload: {
          branchId,
          academicSessionId: session,
          classId: klass,
          gradingSystemId: grading,
          name: 'Marks Exam',
        },
      })
    ).json().data.id;
    esId = (
      await app.inject({
        method: 'POST',
        url: `/v1/exams/${exam}/subjects`,
        headers: auth(),
        payload: { subjectId: subject, examDate: '2026-12-10', maxMarks: 100, passMarks: 33 },
      })
    ).json().data.id;
    s1 = (
      await app.inject({
        method: 'POST',
        url: '/v1/students',
        headers: auth(),
        payload: {
          branchId,
          admissionNumber: `MK1-${suffix}`,
          firstName: 'Ann',
          currentClassId: klass,
        },
      })
    ).json().data.id;
    s2 = (
      await app.inject({
        method: 'POST',
        url: '/v1/students',
        headers: auth(),
        payload: {
          branchId,
          admissionNumber: `MK2-${suffix}`,
          firstName: 'Ben',
          currentClassId: klass,
        },
      })
    ).json().data.id;

    // A teacher NOT assigned to this subject (for the ABAC deny test).
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const [tu] = await adminDb
      .insert(users)
      .values({ email: `examteacher-${suffix}@test.dev`, passwordHash, status: 'active' })
      .returning();
    await adminDb
      .insert(userTenantRoles)
      .values({ userId: tu!.id, tenantId, role: 'teacher', isPrimaryRole: true });
    teacherToken = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { 'x-tenant-slug': SLUG },
        payload: { email: `examteacher-${suffix}@test.dev`, password: PASSWORD },
      })
    ).json().data.accessToken;
  });

  it('enters marks (with absent) and computes grades', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/exam-subjects/${esId}/marks`,
      headers: auth(),
      payload: {
        entries: [
          { studentId: s1, marksObtained: 85 },
          { studentId: s2, isAbsent: true },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.saved).toBe(2);

    const grid = await app.inject({
      method: 'GET',
      url: `/v1/exam-subjects/${esId}/marks`,
      headers: auth(),
    });
    const rows = grid.json().data.rows as Array<{
      studentId: string;
      marksObtained: number | null;
      grade: string | null;
      isAbsent: boolean;
    }>;
    const a = rows.find((x) => x.studentId === s1)!;
    const b = rows.find((x) => x.studentId === s2)!;
    expect(a.marksObtained).toBe(85);
    expect(a.grade).toBe('A2'); // CBSE 81–90
    expect(b.isAbsent).toBe(true);
    expect(b.grade).toBeNull();
  });

  it('a teacher who does not teach the subject is blocked → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/exam-subjects/${esId}/marks`,
      headers: { 'x-tenant-slug': SLUG, authorization: `Bearer ${teacherToken}` },
      payload: { entries: [{ studentId: s1, marksObtained: 50 }] },
    });
    expect(res.statusCode).toBe(403);
  });

  it('verifies then locks; locked marks reject further edits', async () => {
    const verify = await app.inject({
      method: 'POST',
      url: `/v1/exam-subjects/${esId}/verify`,
      headers: auth(),
    });
    expect(verify.json().data.verified).toBe(2);

    const lock = await app.inject({
      method: 'POST',
      url: `/v1/exam-subjects/${esId}/lock`,
      headers: auth(),
    });
    expect(lock.json().data.locked).toBe(2);

    const edit = await app.inject({
      method: 'POST',
      url: `/v1/exam-subjects/${esId}/marks`,
      headers: auth(),
      payload: { entries: [{ studentId: s1, marksObtained: 99 }] },
    });
    expect(edit.statusCode).toBe(409);
  });
});

describe('grade calc + rank (P2-MOD-17)', () => {
  it('aggregates marks into ranked report cards', async () => {
    const mk = async (url: string, payload: Record<string, unknown>) => {
      const res = await app.inject({ method: 'POST', url, headers: auth(), payload });
      return res.json().data;
    };

    const session = (
      await mk('/v1/academic-sessions', {
        branchId,
        name: 'R-2026',
        startDate: '2026-04-01',
        endDate: '2027-03-31',
      })
    ).id;
    const klass = (await mk('/v1/classes', { branchId, name: 'Grade 9', classType: 'secondary' }))
      .id;
    const subA = (await mk('/v1/subjects', { branchId, name: 'Phys', code: `P-${suffix}` })).id;
    const subB = (await mk('/v1/subjects', { branchId, name: 'Chem', code: `C-${suffix}` })).id;
    const grading = (await mk('/v1/grading-systems/from-preset', { branchId, preset: 'cbse' })).id;
    const exam = (
      await mk('/v1/exams', {
        branchId,
        academicSessionId: session,
        classId: klass,
        gradingSystemId: grading,
        name: 'Ranker',
      })
    ).id;
    const esA = (
      await mk(`/v1/exams/${exam}/subjects`, {
        subjectId: subA,
        examDate: '2026-12-15',
        maxMarks: 100,
      })
    ).id;
    const esB = (
      await mk(`/v1/exams/${exam}/subjects`, {
        subjectId: subB,
        examDate: '2026-12-17',
        maxMarks: 100,
      })
    ).id;
    const top = (
      await mk('/v1/students', {
        branchId,
        admissionNumber: `RK1-${suffix}`,
        firstName: 'Top',
        currentClassId: klass,
      })
    ).id;
    const low = (
      await mk('/v1/students', {
        branchId,
        admissionNumber: `RK2-${suffix}`,
        firstName: 'Low',
        currentClassId: klass,
      })
    ).id;

    // Top: 90 + 80 = 170/200 = 85%. Low: 60 + 50 = 110/200 = 55%.
    await mk(`/v1/exam-subjects/${esA}/marks`, {
      entries: [
        { studentId: top, marksObtained: 90 },
        { studentId: low, marksObtained: 60 },
      ],
    });
    await mk(`/v1/exam-subjects/${esB}/marks`, {
      entries: [
        { studentId: top, marksObtained: 80 },
        { studentId: low, marksObtained: 50 },
      ],
    });

    const compute = await mk(`/v1/exams/${exam}/compute`, {});
    expect(compute.students).toBe(2);

    const cards = (
      await app.inject({ method: 'GET', url: `/v1/exams/${exam}/report-cards`, headers: auth() })
    ).json().data as Array<{ studentId: string; percentage: number; grade: string; rank: number }>;
    expect(cards[0]).toMatchObject({ studentId: top, percentage: 85, grade: 'A2', rank: 1 });
    expect(cards[1]).toMatchObject({ studentId: low, percentage: 55, grade: 'C1', rank: 2 });
  });
});

describe('academic analytics (P2-MOD-22)', () => {
  it('reports subject stats, pass %, and grade distribution', async () => {
    const mk = async (url: string, payload: Record<string, unknown>) => {
      const res = await app.inject({ method: 'POST', url, headers: auth(), payload });
      return res.json().data;
    };
    const session = (
      await mk('/v1/academic-sessions', {
        branchId,
        name: 'A-2026',
        startDate: '2026-04-01',
        endDate: '2027-03-31',
      })
    ).id;
    const klass = (await mk('/v1/classes', { branchId, name: 'Grade 10', classType: 'secondary' }))
      .id;
    const subject = (await mk('/v1/subjects', { branchId, name: 'Bio', code: `B-${suffix}` })).id;
    const grading = (await mk('/v1/grading-systems/from-preset', { branchId, preset: 'cbse' })).id;
    const exam = (
      await mk('/v1/exams', {
        branchId,
        academicSessionId: session,
        classId: klass,
        gradingSystemId: grading,
        name: 'Analytics Exam',
      })
    ).id;
    const es = (
      await mk(`/v1/exams/${exam}/subjects`, {
        subjectId: subject,
        examDate: '2026-12-20',
        maxMarks: 100,
        passMarks: 33,
      })
    ).id;
    const pass = (
      await mk('/v1/students', {
        branchId,
        admissionNumber: `AN1-${suffix}`,
        firstName: 'P',
        currentClassId: klass,
      })
    ).id;
    const fail = (
      await mk('/v1/students', {
        branchId,
        admissionNumber: `AN2-${suffix}`,
        firstName: 'F',
        currentClassId: klass,
      })
    ).id;

    // 80 (pass) and 20 (fail) → avg 50, pass% 50.
    await mk(`/v1/exam-subjects/${es}/marks`, {
      entries: [
        { studentId: pass, marksObtained: 80 },
        { studentId: fail, marksObtained: 20 },
      ],
    });
    await mk(`/v1/exams/${exam}/compute`, {});

    const res = await app.inject({
      method: 'GET',
      url: `/v1/exams/${exam}/analytics`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    const bio = d.subjectStats.find((s: { subject: string }) => s.subject === 'Bio');
    expect(bio).toMatchObject({
      count: 2,
      average: 50,
      highest: 80,
      lowest: 20,
      passCount: 1,
      passPercent: 50,
    });
    expect(d.overall).toMatchObject({ students: 2, passCount: 1, passPercent: 50 });
    expect(d.gradeDistribution.length).toBeGreaterThanOrEqual(1);
  });
});
