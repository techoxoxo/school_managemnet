import { boolean, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { classTypeEnum, subjectTypeEnum } from './enums.js';
import { staffMembers } from './staff.js';
import { academicSessions, branches, tenants } from './tenants.js';

/** Tenant-scoped (RLS). Classes/grades/batches per branch (Plan §4.F). */
export const classes = pgTable(
  'classes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    classType: classTypeEnum('class_type').notNull().default('primary'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('classes_branch_name_unique').on(t.tenantId, t.branchId, t.name)],
);

/** Tenant-scoped (RLS). Sections within a class. */
export const sections = pgTable(
  'sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    capacity: integer('capacity').notNull().default(40),
    /** FK to staff_members added when the staff module lands (P1-MOD-18). */
    classTeacherId: uuid('class_teacher_id'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('sections_class_name_unique').on(t.tenantId, t.classId, t.name)],
);

/** Tenant-scoped (RLS). Subjects per branch. */
export const subjects = pgTable(
  'subjects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    code: text('code').notNull(),
    subjectType: subjectTypeEnum('subject_type').notNull().default('core'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('subjects_branch_code_unique').on(t.tenantId, t.branchId, t.code)],
);

/** Tenant-scoped (RLS). Which subjects a class studies in a session. */
export const classSubjects = pgTable(
  'class_subjects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    academicSessionId: uuid('academic_session_id')
      .notNull()
      .references(() => academicSessions.id, { onDelete: 'cascade' }),
    isMandatory: boolean('is_mandatory').notNull().default(true),
    weeklyPeriods: integer('weekly_periods').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('class_subjects_unique').on(
      t.tenantId,
      t.classId,
      t.subjectId,
      t.academicSessionId,
    ),
  ],
);

/**
 * Tenant-scoped (RLS). Which teacher teaches a subject to a class/section
 * in a session (P1-MOD-07, Plan §4.F). `section_id` NULL = the whole class.
 */
export const subjectTeachers = pgTable(
  'subject_teachers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    sectionId: uuid('section_id').references(() => sections.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    academicSessionId: uuid('academic_session_id')
      .notNull()
      .references(() => academicSessions.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staffMembers.id, { onDelete: 'cascade' }),
    isPrimary: boolean('is_primary').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('subject_teachers_unique').on(
      t.tenantId,
      t.classId,
      t.sectionId,
      t.subjectId,
      t.academicSessionId,
      t.staffId,
    ),
  ],
);
