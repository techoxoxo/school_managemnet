import { bigint, date, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import {
  feeDiscountTypeEnum,
  feeDueStatusEnum,
  feeFrequencyEnum,
  feePaymentMethodEnum,
  feePaymentStatusEnum,
} from './enums.js';
import { academicSessions, branches, tenants } from './tenants.js';
import { classes } from './academics.js';
import { students } from './people.js';
import { users } from './users.js';

/**
 * Fee schema (Plan §4.I, P2-MOD-01). ALL money is stored in minor units
 * (paise/cents) as bigint — never floats. Tenant-scoped (RLS).
 */

/** A named fee plan for a class in a session (e.g. "Grade 5 · 2026-27"). */
export const feeStructures = pgTable(
  'fee_structures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    academicSessionId: uuid('academic_session_id')
      .notNull()
      .references(() => academicSessions.id, { onDelete: 'cascade' }),
    classId: uuid('class_id').references(() => classes.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('fee_structures_unique').on(t.tenantId, t.academicSessionId, t.classId, t.name),
  ],
);

/** A line item within a structure (Tuition, Transport…) with its amount. */
export const feeStructureItems = pgTable('fee_structure_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  structureId: uuid('structure_id')
    .notNull()
    .references(() => feeStructures.id, { onDelete: 'cascade' }),
  head: text('head').notNull(),
  /** Minor units. */
  amount: bigint('amount', { mode: 'number' }).notNull(),
  frequency: feeFrequencyEnum('frequency').notNull().default('annual'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** A per-student amount owed for a head in a period (the allocation result). */
export const feeDues = pgTable('fee_dues', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id')
    .notNull()
    .references(() => students.id, { onDelete: 'cascade' }),
  structureItemId: uuid('structure_item_id').references(() => feeStructureItems.id, {
    onDelete: 'set null',
  }),
  head: text('head').notNull(),
  /** e.g. '2026-04' (monthly), 'Q1', or 'annual'. */
  period: text('period').notNull(),
  amountDue: bigint('amount_due', { mode: 'number' }).notNull(),
  amountPaid: bigint('amount_paid', { mode: 'number' }).notNull().default(0),
  discountAmount: bigint('discount_amount', { mode: 'number' }).notNull().default(0),
  status: feeDueStatusEnum('status').notNull().default('pending'),
  dueDate: date('due_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** A payment collected from a student. Receipt numbers are unique per tenant. */
export const feePayments = pgTable(
  'fee_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    /** Minor units. */
    amount: bigint('amount', { mode: 'number' }).notNull(),
    method: feePaymentMethodEnum('method').notNull().default('cash'),
    reference: text('reference'),
    receiptNumber: text('receipt_number').notNull(),
    status: feePaymentStatusEnum('status').notNull().default('completed'),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
    collectedBy: uuid('collected_by').references(() => users.id, { onDelete: 'set null' }),
    remarks: text('remarks'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('fee_payments_receipt_unique').on(t.tenantId, t.receiptNumber)],
);

/** Which dues a payment covered, so a bounce/refund can be reversed exactly. */
export const feePaymentAllocations = pgTable('fee_payment_allocations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  paymentId: uuid('payment_id')
    .notNull()
    .references(() => feePayments.id, { onDelete: 'cascade' }),
  dueId: uuid('due_id')
    .notNull()
    .references(() => feeDues.id, { onDelete: 'cascade' }),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** A concession applied to a student's fees (approval workflow). */
export const feeDiscounts = pgTable('fee_discounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id')
    .notNull()
    .references(() => students.id, { onDelete: 'cascade' }),
  discountType: feeDiscountTypeEnum('discount_type').notNull().default('custom'),
  /** 'flat' → value is minor units; 'percent' → value is basis points (5000 = 50%). */
  valueType: text('value_type').notNull().default('flat'),
  value: bigint('value', { mode: 'number' }).notNull(),
  reason: text('reason'),
  /** pending | approved | rejected */
  status: text('status').notNull().default('approved'),
  approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
