import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import * as schema from './schema/index.js';

export type TenantDb = NodePgDatabase<typeof schema>;

/**
 * RLS enforcement point (P0-API-04 primitive).
 *
 * Runs `fn` inside a transaction with `app.tenant_id` set as a
 * transaction-local GUC. Every RLS policy filters on this value, so all
 * queries inside `fn` are hard-scoped to the tenant at the database level —
 * even if application code forgets a WHERE clause.
 *
 * The pool MUST connect as the non-superuser `schoolmate_app` role;
 * superusers bypass RLS entirely.
 */
export async function withTenant<T>(
  pool: pg.Pool,
  tenantId: string,
  fn: (db: TenantDb) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // set_config(..., true) = transaction-local; resets on COMMIT/ROLLBACK.
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const db = drizzle(client, { schema });
    const result = await fn(db);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
