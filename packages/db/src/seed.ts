/**
 * Dev seed (P0-DB-07): demo tenant + branch + session + tenant-admin user.
 * Run with: npm run seed -w @schoolmate/db
 * Connects as the migration (superuser) role — RLS does not apply to seeding.
 */
import bcrypt from 'bcryptjs';
import { createDb, createPool } from './client.js';
import { academicSessions, branches, tenants, users, userTenantRoles } from './schema/index.js';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://schoolmate:schoolmate_dev@localhost:5433/schoolmate';

async function seed() {
  const pool = createPool(DATABASE_URL);
  const db = createDb(pool);

  // Platform super-admin (admin panel) — idempotent, independent of any tenant.
  const platformHash = await bcrypt.hash('admin123', 10);
  await db
    .insert(users)
    .values({
      email: 'platform@schoolmate.test',
      passwordHash: platformHash,
      isEmailVerified: true,
      isPlatformAdmin: true,
    })
    .onConflictDoNothing({ target: users.email });
  console.log('[seed] platform admin: platform@schoolmate.test / admin123');

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: 'Springfield Academy',
      slug: 'springfield',
      instituteType: 'school',
      subscriptionPlan: 'growth',
      subscriptionStatus: 'active',
      maxBranches: 3,
      maxStudents: 1000,
      onboardedAt: new Date(),
    })
    .onConflictDoNothing({ target: tenants.slug })
    .returning();

  if (!tenant) {
    console.log('[seed] tenant "springfield" already exists — skipping');
    await pool.end();
    return;
  }

  const [branch] = await db
    .insert(branches)
    .values({
      tenantId: tenant.id,
      name: 'Main Campus',
      code: 'MAIN',
      isMainBranch: true,
    })
    .returning();
  if (!branch) throw new Error('branch insert failed');

  await db.insert(academicSessions).values({
    tenantId: tenant.id,
    branchId: branch.id,
    name: '2026-2027',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    isCurrent: true,
  });

  const passwordHash = await bcrypt.hash('admin123', 10);
  const [admin] = await db
    .insert(users)
    .values({
      email: 'admin@springfield.test',
      passwordHash,
      isEmailVerified: true,
    })
    .returning();
  if (!admin) throw new Error('user insert failed');

  await db.insert(userTenantRoles).values({
    userId: admin.id,
    tenantId: tenant.id,
    branchId: branch.id,
    role: 'tenant_admin',
    isPrimaryRole: true,
  });

  console.log('[seed] done:');
  console.log(`  tenant:  ${tenant.name} (${tenant.slug})`);
  console.log(`  branch:  ${branch.name}`);
  console.log('  admin:   admin@springfield.test / admin123');

  await pool.end();
}

seed().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
