import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

/**
 * Tenant-scoped (RLS). One row per bulk-import run (P1-MOD-16). Imported
 * students/parents carry this batch id so a whole import can be rolled back.
 */
export const importBatches = pgTable('import_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  /** What was imported, e.g. 'students'. */
  entityType: text('entity_type').notNull(),
  /** Human label for the run ("Jan intake"). */
  tag: text('tag'),
  rowCount: integer('row_count').notNull().default(0),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
