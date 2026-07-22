import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { academicSessions, branches, tenants } from './tenants.js';
import { classes, sections } from './academics.js';
import { students } from './people.js';
import { users } from './users.js';
import { attendanceSourceEnum, attendanceTypeEnum, studentAttendanceStatusEnum } from './enums.js';

/** Tenant-scoped (RLS). Per-branch attendance policy (Plan §4.H). */
export const attendanceSettings = pgTable(
  'attendance_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    attendanceType: attendanceTypeEnum('attendance_type').notNull().default('daily'),
    autoNotifyParentOnAbsent: boolean('auto_notify_parent_on_absent').notNull().default(true),
    notifyAfterConsecutiveAbsents: integer('notify_after_consecutive_absents').notNull().default(3),
    minimumAttendancePercentage: integer('minimum_attendance_percentage').notNull().default(75),
    lateThresholdMinutes: integer('late_threshold_minutes').notNull().default(15),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('attendance_settings_branch_unique').on(t.tenantId, t.branchId)],
);

/** Tenant-scoped (RLS). One row per student per day (Plan §4.H). */
export const studentAttendance = pgTable(
  'student_attendance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    classId: uuid('class_id').references(() => classes.id, { onDelete: 'set null' }),
    sectionId: uuid('section_id').references(() => sections.id, { onDelete: 'set null' }),
    academicSessionId: uuid('academic_session_id').references(() => academicSessions.id, {
      onDelete: 'set null',
    }),
    date: date('date').notNull(),
    status: studentAttendanceStatusEnum('status').notNull(),
    /** [{period, status}] for period-wise mode; null for daily. */
    periodWise: jsonb('period_wise'),
    source: attendanceSourceEnum('source').notNull().default('manual'),
    markedBy: uuid('marked_by').references(() => users.id, { onDelete: 'set null' }),
    markedAt: timestamp('marked_at', { withTimezone: true }).notNull().defaultNow(),
    parentNotified: boolean('parent_notified').notNull().default(false),
    remarks: text('remarks'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('student_attendance_unique').on(t.tenantId, t.studentId, t.date)],
);
