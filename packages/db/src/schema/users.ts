import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { roleEnum, userStatusEnum } from './enums.js';
import { branches, tenants } from './tenants.js';

/** Platform-level: one identity across all tenants (Plan §4.B). */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  phone: text('phone'),
  passwordHash: text('password_hash'),
  isEmailVerified: boolean('is_email_verified').notNull().default(false),
  isPhoneVerified: boolean('is_phone_verified').notNull().default(false),
  mfaEnabled: boolean('mfa_enabled').notNull().default(false),
  mfaSecret: text('mfa_secret'),
  /** Platform super-admin (operates across tenants via the admin panel). */
  isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  status: userStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Tenant-scoped (RLS enforced): a user's role(s) within one tenant. */
export const customRoles = pgTable('custom_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  permissions: jsonb('permissions').notNull().default([]),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Tenant-scoped (RLS enforced). */
export const userTenantRoles = pgTable(
  'user_tenant_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    role: roleEnum('role').notNull(),
    customRoleId: uuid('custom_role_id').references(() => customRoles.id, {
      onDelete: 'set null',
    }),
    /** Per-user overrides/extensions on top of the role's permission set. */
    permissions: jsonb('permissions').notNull().default([]),
    isPrimaryRole: boolean('is_primary_role').notNull().default(false),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [uniqueIndex('user_tenant_role_unique').on(t.userId, t.tenantId, t.role)],
);

/** Platform-level: catalog of all grantable permissions (module.action). */
export const permissionsCatalog = pgTable(
  'permissions_catalog',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    module: text('module').notNull(),
    action: text('action').notNull(),
    description: text('description'),
  },
  (t) => [uniqueIndex('permission_module_action_unique').on(t.module, t.action)],
);
