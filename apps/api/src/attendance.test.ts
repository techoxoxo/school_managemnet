/**
 * Staff + Attendance (P1-MOD-18/22/23/25, P1-API-03) — live Postgres + Redis.
 * The headline: marking a student absent emits attendance.absent to the outbox
 * with the linked parents as recipients — the exact event the notification
 * engine's handler consumes to alert parents.
 */
import {
  createDb,
  createPool,
  outboxEvents,
  tenants,
  users,
  userTenantRoles,
} from '@schoolmate/db';
import bcrypt from 'bcryptjs';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

const ADMIN_URL =
  process.env.DATABASE_URL ?? 'postgres://schoolmate:schoolmate_dev@localhost:5433/schoolmate';

let app: FastifyInstance;
const adminPool = createPool(ADMIN_URL);
const adminDb = createDb(adminPool);

const suffix = Date.now().toString(36);
const SLUG = `attn-${suffix}`;
const ADMIN_EMAIL = `attnadmin-${suffix}@test.dev`;
const TEACHER_EMAIL = `attnteacher-${suffix}@test.dev`;
const PASSWORD = 'pw-12345678';

let tenantId: string;
let branchId: string;
let adminToken: string;
let teacherToken: string;

const auth = (t: string) => ({ 'x-tenant-slug': SLUG, authorization: `Bearer ${t}` });
const login = async (email: string) =>
  (
    await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'x-tenant-slug': SLUG },
      payload: { email, password: PASSWORD },
    })
  ).json().data.accessToken as string;

const createStudent = async (firstName: string) =>
  (
    await app.inject({
      method: 'POST',
      url: '/v1/students',
      headers: auth(adminToken),
      payload: {
        branchId,
        admissionNumber: `A-${Math.random().toString(36).slice(2, 8)}`,
        firstName,
      },
    })
  ).json().data.id as string;

beforeAll(async () => {
  const [t] = await adminDb
    .insert(tenants)
    .values({ name: 'Attn Test', slug: SLUG, subscriptionStatus: 'active' })
    .returning();
  tenantId = t!.id;
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const ins = await adminDb
    .insert(users)
    .values([
      { email: ADMIN_EMAIL, passwordHash, status: 'active' },
      { email: TEACHER_EMAIL, passwordHash, status: 'active' },
    ])
    .returning();
  await adminDb.insert(userTenantRoles).values([
    { userId: ins[0]!.id, tenantId, role: 'tenant_admin', isPrimaryRole: true },
    { userId: ins[1]!.id, tenantId, role: 'teacher', isPrimaryRole: true },
  ]);

  app = await buildApp();
  await app.ready();
  adminToken = await login(ADMIN_EMAIL);
  teacherToken = await login(TEACHER_EMAIL);
  branchId = (
    await app.inject({
      method: 'POST',
      url: '/v1/branches',
      headers: auth(adminToken),
      payload: { name: 'Main', code: 'MAIN' },
    })
  ).json().data.id;
});

afterAll(async () => {
  await adminDb.execute(sql`DELETE FROM tenants WHERE id = ${tenantId}`);
  await adminDb.execute(sql`DELETE FROM users WHERE email IN (${ADMIN_EMAIL}, ${TEACHER_EMAIL})`);
  await app.close();
  await adminPool.end();
});

describe('staff CRUD (P1-MOD-18/19)', () => {
  it('creates staff + department, enforces unique employee id', async () => {
    const dept = await app.inject({
      method: 'POST',
      url: '/v1/departments',
      headers: auth(adminToken),
      payload: { branchId, name: 'Science' },
    });
    expect(dept.statusCode).toBe(201);

    const staff = await app.inject({
      method: 'POST',
      url: '/v1/staff',
      headers: auth(adminToken),
      payload: { branchId, employeeId: 'EMP-1', firstName: 'Edna', designation: 'Teacher' },
    });
    expect(staff.statusCode).toBe(201);

    const dup = await app.inject({
      method: 'POST',
      url: '/v1/staff',
      headers: auth(adminToken),
      payload: { branchId, employeeId: 'EMP-1', firstName: 'Other' },
    });
    expect(dup.statusCode).toBe(409);
  });
});

describe('attendance marking + absent notification (P1-MOD-23 / P1-API-03)', () => {
  it('teacher marks a class; absent student with a linked parent emits attendance.absent', async () => {
    const present = await createStudent('Present Pat');
    const absent = await createStudent('Absent Alex');

    // Link a parent (with a phone) to the absent student.
    const parentId = (
      await app.inject({
        method: 'POST',
        url: '/v1/parents',
        headers: auth(adminToken),
        payload: { firstName: 'Homer', relation: 'father', phone: '555-0143' },
      })
    ).json().data.id;
    await app.inject({
      method: 'POST',
      url: `/v1/students/${absent}/parents`,
      headers: auth(adminToken),
      payload: { parentId, isPrimaryContact: true },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/attendance/mark',
      headers: auth(teacherToken),
      payload: {
        branchId,
        date: '2026-07-20',
        entries: [
          { studentId: present, status: 'present' },
          { studentId: absent, status: 'absent' },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ marked: 2, absent: 1, notified: 1 });

    // The absent event is in the outbox with the parent as recipient.
    const [event] = await adminDb
      .select()
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.tenantId, tenantId),
          eq(outboxEvents.aggregateId, absent),
          eq(outboxEvents.eventType, 'attendance.absent'),
        ),
      );
    expect(event).toBeTruthy();
    const payload = event!.payload as {
      studentName: string;
      recipients: Array<{ phone?: string }>;
    };
    expect(payload.studentName).toContain('Absent');
    expect(payload.recipients[0]!.phone).toBe('555-0143');
  });

  it('re-marking the same day is idempotent (upsert, no duplicate rows)', async () => {
    const s = await createStudent('Recount Ron');
    const mark = (status: string) =>
      app.inject({
        method: 'POST',
        url: '/v1/attendance/mark',
        headers: auth(teacherToken),
        payload: { branchId, date: '2026-07-21', entries: [{ studentId: s, status }] },
      });
    await mark('absent');
    await mark('present'); // correction

    const daily = await app.inject({
      method: 'GET',
      url: `/v1/attendance/daily?date=2026-07-21&branchId=${branchId}`,
      headers: auth(teacherToken),
    });
    const rows = daily.json().data.filter((r: { studentId: string }) => r.studentId === s);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('present');
  });

  it('computes an attendance percentage report', async () => {
    const s = await createStudent('Report Rita');
    const days: Array<[string, string]> = [
      ['2026-08-01', 'present'],
      ['2026-08-02', 'present'],
      ['2026-08-03', 'absent'],
      ['2026-08-04', 'late'],
    ];
    for (const [date, status] of days) {
      await app.inject({
        method: 'POST',
        url: '/v1/attendance/mark',
        headers: auth(teacherToken),
        payload: { branchId, date, entries: [{ studentId: s, status }] },
      });
    }
    const report = await app.inject({
      method: 'GET',
      url: `/v1/attendance/students/${s}/report?from=2026-08-01&to=2026-08-31`,
      headers: auth(teacherToken),
    });
    expect(report.statusCode).toBe(200);
    const data = report.json().data;
    expect(data.workingDays).toBe(4);
    // present(2)+late(1) attended of 4 → 75%
    expect(data.percentage).toBe(75);
  });

  it('respects autoNotifyParentOnAbsent=false (no event emitted)', async () => {
    await app.inject({
      method: 'PATCH',
      url: '/v1/attendance/settings',
      headers: auth(adminToken),
      payload: { branchId, autoNotifyParentOnAbsent: false },
    });
    const s = await createStudent('Silent Sam');
    const parentId = (
      await app.inject({
        method: 'POST',
        url: '/v1/parents',
        headers: auth(adminToken),
        payload: { firstName: 'Quiet', phone: '555-0000' },
      })
    ).json().data.id;
    await app.inject({
      method: 'POST',
      url: `/v1/students/${s}/parents`,
      headers: auth(adminToken),
      payload: { parentId },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/attendance/mark',
      headers: auth(teacherToken),
      payload: { branchId, date: '2026-09-01', entries: [{ studentId: s, status: 'absent' }] },
    });
    expect(res.json().data.notified).toBe(0);

    const events = await adminDb
      .select()
      .from(outboxEvents)
      .where(and(eq(outboxEvents.aggregateId, s), eq(outboxEvents.eventType, 'attendance.absent')));
    expect(events).toHaveLength(0);
  });
});
