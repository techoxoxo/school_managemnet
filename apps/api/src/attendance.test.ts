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
  staffMembers,
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
let teacherUserId: string;

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
  teacherUserId = ins[1]!.id;
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

  it('marks period-wise attendance and reads the period register (P1-MOD-24)', async () => {
    const s = await createStudent('Periodic Pete');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/attendance/mark-periods',
      headers: auth(teacherToken),
      payload: {
        branchId,
        date: '2026-10-05',
        entries: [
          {
            studentId: s,
            periods: [
              { period: 1, status: 'present' },
              { period: 2, status: 'absent' },
              { period: 3, status: 'late' },
            ],
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ marked: 1 });

    const reg = await app.inject({
      method: 'GET',
      url: `/v1/attendance/periods?date=2026-10-05&branchId=${branchId}`,
      headers: auth(teacherToken),
    });
    const row = reg.json().data.find((x: { studentId: string }) => x.studentId === s);
    expect(row.status).toBe('present'); // rollup: attended ≥1 period
    expect(row.periodWise).toHaveLength(3);
    expect(row.periodWise[1]).toMatchObject({ period: 2, status: 'absent' });
  });

  it('rolls up to absent when no period was attended', async () => {
    const s = await createStudent('Missing Meg');
    await app.inject({
      method: 'POST',
      url: '/v1/attendance/mark-periods',
      headers: auth(teacherToken),
      payload: {
        branchId,
        date: '2026-10-06',
        entries: [{ studentId: s, periods: [{ period: 1, status: 'absent' }] }],
      },
    });
    const reg = await app.inject({
      method: 'GET',
      url: `/v1/attendance/periods?date=2026-10-06&branchId=${branchId}`,
      headers: auth(teacherToken),
    });
    const row = reg.json().data.find((x: { studentId: string }) => x.studentId === s);
    expect(row.status).toBe('absent');
  });

  it('rejects duplicate period numbers for a student → 400', async () => {
    const s = await createStudent('Dupe Dan');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/attendance/mark-periods',
      headers: auth(teacherToken),
      payload: {
        branchId,
        date: '2026-10-07',
        entries: [
          {
            studentId: s,
            periods: [
              { period: 1, status: 'present' },
              { period: 1, status: 'absent' },
            ],
          },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
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

describe('staff attendance: manual marking + self check-in (P1-MOD-27)', () => {
  let staffId: string;

  it('admin bulk-marks staff attendance; register reflects it', async () => {
    staffId = (
      await app.inject({
        method: 'POST',
        url: '/v1/staff',
        headers: auth(adminToken),
        payload: { branchId, employeeId: `SA-${suffix}`, firstName: 'Seymour' },
      })
    ).json().data.id;

    const res = await app.inject({
      method: 'POST',
      url: '/v1/staff-attendance/mark',
      headers: auth(adminToken),
      payload: {
        branchId,
        date: '2026-07-20',
        entries: [{ staffId, status: 'present', checkInTime: '09:00' }],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ marked: 1 });

    const daily = await app.inject({
      method: 'GET',
      url: `/v1/staff-attendance/daily?date=2026-07-20&branchId=${branchId}`,
      headers: auth(adminToken),
    });
    const row = daily.json().data.find((x: { staffId: string }) => x.staffId === staffId);
    expect(row).toMatchObject({ status: 'present', firstName: 'Seymour' });
  });

  it('re-marking the same day is idempotent (upsert)', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/staff-attendance/mark',
      headers: auth(adminToken),
      payload: { branchId, date: '2026-07-20', entries: [{ staffId, status: 'on_leave' }] },
    });
    const daily = await app.inject({
      method: 'GET',
      url: `/v1/staff-attendance/daily?date=2026-07-20&branchId=${branchId}`,
      headers: auth(adminToken),
    });
    const rows = daily.json().data.filter((x: { staffId: string }) => x.staffId === staffId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('on_leave');
  });

  it('teacher (no staff.manage) cannot bulk-mark → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/staff-attendance/mark',
      headers: auth(teacherToken),
      payload: { branchId, date: '2026-07-22', entries: [{ staffId, status: 'present' }] },
    });
    expect(res.statusCode).toBe(403);
  });

  it('self check-in then check-out records times for the caller only', async () => {
    // Link the teacher's user account to a staff record.
    const [teacherStaff] = await adminDb
      .insert(staffMembers)
      .values({
        tenantId,
        branchId,
        userId: teacherUserId,
        employeeId: `SELF-${suffix}`,
        firstName: 'Ned',
      })
      .returning();

    const checkIn = await app.inject({
      method: 'POST',
      url: '/v1/staff-attendance/check-in',
      headers: auth(teacherToken),
      payload: { date: '2026-07-23', checkInTime: '08:45' },
    });
    expect(checkIn.statusCode).toBe(200);
    expect(checkIn.json().data).toMatchObject({
      staffId: teacherStaff!.id,
      status: 'present',
      checkInTime: '08:45:00',
    });

    const checkOut = await app.inject({
      method: 'POST',
      url: '/v1/staff-attendance/check-out',
      headers: auth(teacherToken),
      payload: { date: '2026-07-23', checkOutTime: '17:30' },
    });
    expect(checkOut.statusCode).toBe(200);
    expect(checkOut.json().data.checkOutTime).toBe('17:30:00');
  });

  it('check-in without a linked staff record → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/staff-attendance/check-in',
      headers: auth(adminToken), // admin user has no staff_members row
      payload: { date: '2026-07-23' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('check-out before any check-in → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/staff-attendance/check-out',
      headers: auth(teacherToken),
      payload: { date: '2026-11-30' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('staff user account + role assignment (P1-MOD-19)', () => {
  const NEW_EMAIL = `newstaff-${suffix}@test.dev`;
  let staffId: string;

  afterAll(async () => {
    await adminDb.execute(sql`DELETE FROM users WHERE email = ${NEW_EMAIL}`);
  });

  const makeStaff = async (employeeId: string) =>
    (
      await app.inject({
        method: 'POST',
        url: '/v1/staff',
        headers: auth(adminToken),
        payload: { branchId, employeeId, firstName: 'Waylon' },
      })
    ).json().data.id as string;

  it('admin creates an account: user + link + role + event', async () => {
    staffId = await makeStaff(`ACCT-${suffix}`);
    const res = await app.inject({
      method: 'POST',
      url: `/v1/staff/${staffId}/account`,
      headers: auth(adminToken),
      payload: { email: NEW_EMAIL, role: 'teacher' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ email: NEW_EMAIL, role: 'teacher', isNewUser: true });

    const userId = res.json().data.userId;
    const [linkedStaff] = await adminDb
      .select()
      .from(staffMembers)
      .where(eq(staffMembers.id, staffId));
    expect(linkedStaff!.userId).toBe(userId);

    const roles = await adminDb
      .select()
      .from(userTenantRoles)
      .where(and(eq(userTenantRoles.userId, userId), eq(userTenantRoles.tenantId, tenantId)));
    expect(roles.map((r) => r.role)).toContain('teacher');

    const [created] = await adminDb.select().from(users).where(eq(users.email, NEW_EMAIL));
    expect(created!.passwordHash).toBeNull(); // set later via reset/invite

    const [event] = await adminDb
      .select()
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.aggregateId, staffId),
          eq(outboxEvents.eventType, 'staff.account_created'),
        ),
      );
    expect(event).toBeTruthy();
  });

  it('rejects super_admin as an assignable role (400)', async () => {
    const s = await makeStaff(`SUP-${suffix}`);
    const res = await app.inject({
      method: 'POST',
      url: `/v1/staff/${s}/account`,
      headers: auth(adminToken),
      payload: { email: `sup-${suffix}@test.dev`, role: 'super_admin' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('teacher (no user.manage) cannot create an account → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/staff/${staffId}/account`,
      headers: auth(teacherToken),
      payload: { email: `x-${suffix}@test.dev`, role: 'teacher' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('creating a second account for the same staff → 409', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/staff/${staffId}/account`,
      headers: auth(adminToken),
      payload: { email: `dup-${suffix}@test.dev`, role: 'teacher' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('assigns an additional role and lists both, then removes one', async () => {
    const add = await app.inject({
      method: 'POST',
      url: `/v1/staff/${staffId}/roles`,
      headers: auth(adminToken),
      payload: { role: 'accountant' },
    });
    expect(add.statusCode).toBe(201);

    const list = await app.inject({
      method: 'GET',
      url: `/v1/staff/${staffId}/roles`,
      headers: auth(adminToken),
    });
    const roles = list.json().data as Array<{ id: string; role: string }>;
    expect(roles.map((r) => r.role).sort()).toEqual(['accountant', 'teacher']);

    const accountantRoleId = roles.find((r) => r.role === 'accountant')!.id;
    const del = await app.inject({
      method: 'DELETE',
      url: `/v1/staff/${staffId}/roles/${accountantRoleId}`,
      headers: auth(adminToken),
    });
    expect(del.statusCode).toBe(200);

    const after = await app.inject({
      method: 'GET',
      url: `/v1/staff/${staffId}/roles`,
      headers: auth(adminToken),
    });
    expect((after.json().data as unknown[]).length).toBe(1);
  });
});
