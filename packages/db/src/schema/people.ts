import {
  bigint,
  boolean,
  date,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { genderEnum, parentRelationEnum, studentStatusEnum } from './enums.js';
import { classes, sections } from './academics.js';
import { branches, tenants } from './tenants.js';
import { users } from './users.js';

/** Tenant-scoped (RLS). Students (Plan §4.C). */
export const students = pgTable(
  'students',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    admissionNumber: text('admission_number').notNull(),
    rollNumber: text('roll_number'),
    firstName: text('first_name').notNull(),
    lastName: text('last_name'),
    dateOfBirth: date('date_of_birth'),
    gender: genderEnum('gender'),
    bloodGroup: text('blood_group'),
    nationality: text('nationality'),
    religion: text('religion'),
    category: text('category'),
    /** CRITICAL: stores AES-256-GCM ciphertext, never plaintext (Plan §13). */
    govtIdEncrypted: text('govt_id_encrypted'),
    photoUrl: text('photo_url'),
    currentClassId: uuid('current_class_id').references(() => classes.id, { onDelete: 'set null' }),
    currentSectionId: uuid('current_section_id').references(() => sections.id, {
      onDelete: 'set null',
    }),
    admissionDate: date('admission_date'),
    previousSchoolName: text('previous_school_name'),
    status: studentStatusEnum('status').notNull().default('active'),
    statusReason: text('status_reason'),
    medicalInfo: jsonb('medical_info'),
    transportOpted: boolean('transport_opted').notNull().default(false),
    hostelOpted: boolean('hostel_opted').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('students_admission_number_unique').on(t.tenantId, t.admissionNumber)],
);

/** Tenant-scoped (RLS). Parents/guardians (Plan §4.D). */
export const parents = pgTable('parents', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  firstName: text('first_name').notNull(),
  lastName: text('last_name'),
  relation: parentRelationEnum('relation').notNull().default('guardian'),
  phone: text('phone'),
  altPhone: text('alt_phone'),
  email: text('email'),
  occupation: text('occupation'),
  employer: text('employer'),
  address: jsonb('address'),
  photoUrl: text('photo_url'),
  /** Minor units of tenant currency — used for concession/scholarship decisions. */
  annualIncome: bigint('annual_income', { mode: 'number' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Tenant-scoped (RLS). M2M parent↔student; drives sibling detection + fees. */
export const parentStudent = pgTable(
  'parent_student',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id')
      .notNull()
      .references(() => parents.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    relation: parentRelationEnum('relation').notNull().default('guardian'),
    isPrimaryContact: boolean('is_primary_contact').notNull().default(false),
    canPickup: boolean('can_pickup').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('parent_student_unique').on(t.tenantId, t.parentId, t.studentId)],
);
