/**
 * RLS leak-test harness (P0-DB-06) — Plan §22 makes this mandatory:
 * create two tenants, then prove at the DATABASE level that a connection
 * scoped to tenant A can never read or write tenant B's rows.
 *
 * Reusable pattern: every future tenant-scoped table adds itself to
 * TENANT_SCOPED_TABLES and automatically gets the visibility checks.
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, createPool } from './client.js';
import { branches, tenants } from './schema/index.js';
import { withTenant } from './tenant-db.js';

const ADMIN_URL =
  process.env.DATABASE_URL ?? 'postgres://schoolmate:schoolmate_dev@localhost:5433/schoolmate';
// Non-superuser role created by the RLS migration — RLS applies to it.
const APP_URL =
  process.env.DATABASE_APP_URL ??
  'postgres://schoolmate_app:schoolmate_app_dev@localhost:5433/schoolmate';

/** Every tenant-scoped table must appear here (grows with the schema). */
const TENANT_SCOPED_TABLES = [
  'branches',
  'academic_sessions',
  'user_tenant_roles',
  'custom_roles',
  'audit_logs',
  'login_history',
  'classes',
  'sections',
  'subjects',
  'class_subjects',
  'subject_teachers',
  'students',
  'admissions',
  'import_batches',
  'student_documents',
  'parents',
  'parent_student',
  'outbox_events',
  'notifications',
  'notification_queue',
  'notification_preferences',
  'departments',
  'staff_members',
  'staff_attendance',
  'attendance_settings',
  'student_attendance',
  'fee_structures',
  'fee_structure_items',
  'fee_dues',
  'fee_payments',
  'fee_discounts',
];

const adminPool = createPool(ADMIN_URL);
const appPool = createPool(APP_URL);
const adminDb = createDb(adminPool);

let tenantA: string;
let tenantB: string;

beforeAll(async () => {
  const suffix = Date.now().toString(36);
  const rows = await adminDb
    .insert(tenants)
    .values([
      { name: 'RLS Test A', slug: `rls-a-${suffix}` },
      { name: 'RLS Test B', slug: `rls-b-${suffix}` },
    ])
    .returning();
  tenantA = rows[0]!.id;
  tenantB = rows[1]!.id;

  await adminDb.insert(branches).values([
    { tenantId: tenantA, name: 'A Branch', code: 'A1' },
    { tenantId: tenantB, name: 'B Branch', code: 'B1' },
  ]);
});

afterAll(async () => {
  // Cascade deletes clean up branches etc.
  await adminDb.execute(sql`DELETE FROM tenants WHERE id IN (${tenantA}, ${tenantB})`);
  await adminPool.end();
  await appPool.end();
});

describe('RLS tenant isolation', () => {
  it('all tenant-scoped tables have RLS enabled AND forced', async () => {
    const result = await adminPool.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT relname, relrowsecurity, relforcerowsecurity
       FROM pg_class WHERE relname = ANY($1)`,
      [TENANT_SCOPED_TABLES],
    );
    const rows = result.rows;
    expect(rows.map((r) => r.relname).sort()).toEqual([...TENANT_SCOPED_TABLES].sort());
    for (const row of rows) {
      expect(row.relrowsecurity, `${row.relname} must have RLS enabled`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname} must FORCE RLS`).toBe(true);
    }
  });

  it('tenant A context sees only tenant A rows', async () => {
    const visible = await withTenant(appPool, tenantA, (db) => db.select().from(branches));
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((b) => b.tenantId === tenantA)).toBe(true);
    expect(visible.some((b) => b.code === 'B1')).toBe(false);
  });

  it('tenant B context sees only tenant B rows', async () => {
    const visible = await withTenant(appPool, tenantB, (db) => db.select().from(branches));
    expect(visible.every((b) => b.tenantId === tenantB)).toBe(true);
    expect(visible.some((b) => b.code === 'A1')).toBe(false);
  });

  it('no tenant context → zero rows (default deny)', async () => {
    const client = await appPool.connect();
    try {
      const res = await client.query('SELECT count(*)::int AS n FROM branches');
      expect(res.rows[0].n).toBe(0);
    } finally {
      client.release();
    }
  });

  it('cannot INSERT a row for another tenant (WITH CHECK blocks cross-tenant writes)', async () => {
    await expect(
      withTenant(appPool, tenantA, (db) =>
        db.insert(branches).values({ tenantId: tenantB, name: 'Evil', code: 'EVIL' }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('cannot UPDATE another tenant even with explicit WHERE (rows invisible)', async () => {
    const updated = await withTenant(appPool, tenantA, (db) =>
      db.execute(
        sql`UPDATE branches SET name = 'hacked' WHERE tenant_id = ${tenantB} RETURNING id`,
      ),
    );
    expect(updated.rows.length).toBe(0);
    // Verify B untouched via admin connection
    const check = await adminDb.execute(
      sql`SELECT name FROM branches WHERE tenant_id = ${tenantB}`,
    );
    expect((check.rows as Array<{ name: string }>).every((r) => r.name !== 'hacked')).toBe(true);
  });
});
