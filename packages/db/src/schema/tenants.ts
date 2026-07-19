import { boolean, date, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { billingCycleEnum, instituteTypeEnum, subscriptionStatusEnum } from './enums.js';

/** Platform-level. No tenant_id — this IS the tenant registry (Plan §4.A). */
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  customDomain: text('custom_domain').unique(),
  instituteType: instituteTypeEnum('institute_type').notNull().default('school'),
  subscriptionPlan: text('subscription_plan').notNull().default('trial'),
  subscriptionStatus: subscriptionStatusEnum('subscription_status').notNull().default('trial'),
  config: jsonb('config').notNull().default({}),
  logoUrl: text('logo_url'),
  theme: jsonb('theme'),
  maxBranches: integer('max_branches').notNull().default(1),
  maxStudents: integer('max_students').notNull().default(200),
  onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  suspensionReason: text('suspension_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenantBilling = pgTable('tenant_billing', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  planId: text('plan_id').notNull(),
  billingCycle: billingCycleEnum('billing_cycle').notNull().default('monthly'),
  nextBillingDate: date('next_billing_date'),
  /** Minor units (paise/cents) — platform-wide money rule. */
  amount: integer('amount').notNull().default(0),
  paymentGatewayCustomerId: text('payment_gateway_customer_id'),
  autoRenew: boolean('auto_renew').notNull().default(true),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Tenant-scoped (RLS enforced). */
export const branches = pgTable('branches', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  code: text('code').notNull(),
  address: jsonb('address'),
  phone: text('phone'),
  email: text('email'),
  principalName: text('principal_name'),
  isMainBranch: boolean('is_main_branch').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  config: jsonb('config').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Tenant-scoped (RLS enforced). */
export const academicSessions = pgTable('academic_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  branchId: uuid('branch_id')
    .notNull()
    .references(() => branches.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  isCurrent: boolean('is_current').notNull().default(false),
  isLocked: boolean('is_locked').notNull().default(false),
  config: jsonb('config').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
