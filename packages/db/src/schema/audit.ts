import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { loginStatusEnum } from './enums.js';
import { tenants } from './tenants.js';
import { users } from './users.js';

/** Tenant-scoped (RLS enforced). Every write operation lands here (Plan §4.S). */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id),
    userRole: text('user_role'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    oldValues: jsonb('old_values'),
    newValues: jsonb('new_values'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_logs_tenant_entity_idx').on(t.tenantId, t.entityType, t.entityId),
    index('audit_logs_tenant_created_idx').on(t.tenantId, t.createdAt),
  ],
);

/** Tenant-scoped (RLS enforced). */
export const loginHistory = pgTable('login_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  deviceInfo: jsonb('device_info'),
  loginAt: timestamp('login_at', { withTimezone: true }).notNull().defaultNow(),
  logoutAt: timestamp('logout_at', { withTimezone: true }),
  status: loginStatusEnum('status').notNull(),
  failureReason: text('failure_reason'),
});
