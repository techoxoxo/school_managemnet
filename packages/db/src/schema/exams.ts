import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  date,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { examStatusEnum, gradingTypeEnum, resultStatusEnum } from './enums.js';
import { academicSessions, branches, tenants } from './tenants.js';
import { classes, subjects } from './academics.js';
import { students } from './people.js';
import { users } from './users.js';

/** Exam schema (Plan §4.J, P2-MOD-12). Tenant-scoped (RLS). */

/** Categories of exam with weightage (Unit Test, Term 1, Final…). */
export const examTypes = pgTable(
  'exam_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Contribution to a cumulative result, in percent. */
    weightage: integer('weightage').notNull().default(100),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('exam_types_branch_name_unique').on(t.tenantId, t.branchId, t.name)],
);

/** A grading scale (CBSE/ICSE/percentage/GPA). `scale` is [{grade,min,max,points}]. */
export const gradingSystems = pgTable('grading_systems', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  branchId: uuid('branch_id')
    .notNull()
    .references(() => branches.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: gradingTypeEnum('type').notNull().default('percentage'),
  scale: jsonb('scale').notNull().default([]),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** An exam for a class in a session. */
export const exams = pgTable('exams', {
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
  examTypeId: uuid('exam_type_id').references(() => examTypes.id, { onDelete: 'set null' }),
  classId: uuid('class_id').references(() => classes.id, { onDelete: 'set null' }),
  gradingSystemId: uuid('grading_system_id').references(() => gradingSystems.id, {
    onDelete: 'set null',
  }),
  name: text('name').notNull(),
  maxMarks: integer('max_marks').notNull().default(100),
  startDate: date('start_date'),
  endDate: date('end_date'),
  status: examStatusEnum('status').notNull().default('draft'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Datesheet: a subject paper within an exam (P2-MOD-14). */
export const examSubjects = pgTable(
  'exam_subjects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    examId: uuid('exam_id')
      .notNull()
      .references(() => exams.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    examDate: date('exam_date'),
    startTime: time('start_time'),
    maxMarks: integer('max_marks').notNull().default(100),
    passMarks: integer('pass_marks').notNull().default(33),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('exam_subjects_unique').on(t.tenantId, t.examId, t.subjectId)],
);

/** A student's marks for one subject paper (P2-MOD-15/16). */
export const examResults = pgTable(
  'exam_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    examId: uuid('exam_id')
      .notNull()
      .references(() => exams.id, { onDelete: 'cascade' }),
    examSubjectId: uuid('exam_subject_id')
      .notNull()
      .references(() => examSubjects.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    marksObtained: integer('marks_obtained'),
    isAbsent: boolean('is_absent').notNull().default(false),
    isExempt: boolean('is_exempt').notNull().default(false),
    grade: text('grade'),
    status: resultStatusEnum('status').notNull().default('entered'),
    enteredBy: uuid('entered_by').references(() => users.id, { onDelete: 'set null' }),
    verifiedBy: uuid('verified_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('exam_results_unique').on(t.tenantId, t.examSubjectId, t.studentId)],
);

/** Assembled + published report card per student per exam (P2-MOD-18). */
export const reportCards = pgTable(
  'report_cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    examId: uuid('exam_id')
      .notNull()
      .references(() => exams.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    data: jsonb('data').notNull().default({}),
    totalMarks: integer('total_marks'),
    maxMarks: integer('max_marks'),
    /** Percentage × 100 (basis points) to stay integer. */
    percentageBp: integer('percentage_bp'),
    grade: text('grade'),
    rank: integer('rank'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('report_cards_unique').on(t.tenantId, t.examId, t.studentId)],
);
