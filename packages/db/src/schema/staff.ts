import {
  bigint,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  attendanceSourceEnum,
  employmentTypeEnum,
  genderEnum,
  staffAttendanceStatusEnum,
  staffStatusEnum,
} from './enums.js';
import { branches, tenants } from './tenants.js';
import { users } from './users.js';

/** Tenant-scoped (RLS). Departments (Plan §4.E). */
export const departments = pgTable(
  'departments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** FK to staff_members added logically; kept as uuid to avoid a cycle. */
    hodStaffId: uuid('hod_staff_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('departments_branch_name_unique').on(t.tenantId, t.branchId, t.name)],
);

/** Tenant-scoped (RLS). Staff/employees (Plan §4.E). */
export const staffMembers = pgTable(
  'staff_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    employeeId: text('employee_id').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name'),
    dateOfBirth: date('date_of_birth'),
    gender: genderEnum('gender'),
    bloodGroup: text('blood_group'),
    photoUrl: text('photo_url'),
    designation: text('designation'),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    employmentType: employmentTypeEnum('employment_type').notNull().default('permanent'),
    qualification: text('qualification'),
    experienceYears: integer('experience_years'),
    specialization: text('specialization'),
    dateOfJoining: date('date_of_joining'),
    dateOfLeaving: date('date_of_leaving'),
    leavingReason: text('leaving_reason'),
    salaryGrade: text('salary_grade'),
    /** Minor units of tenant currency. */
    baseSalary: bigint('base_salary', { mode: 'number' }),
    /** CRITICAL: AES-256-GCM ciphertext (Plan §13). */
    govtIdEncrypted: text('govt_id_encrypted'),
    address: jsonb('address'),
    emergencyContact: jsonb('emergency_contact'),
    status: staffStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('staff_employee_id_unique').on(t.tenantId, t.employeeId)],
);

/** Tenant-scoped (RLS). Daily staff attendance (Plan §4.E). */
export const staffAttendance = pgTable(
  'staff_attendance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staffMembers.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    checkInTime: time('check_in_time'),
    checkOutTime: time('check_out_time'),
    status: staffAttendanceStatusEnum('status').notNull().default('present'),
    source: attendanceSourceEnum('source').notNull().default('manual'),
    markedBy: uuid('marked_by').references(() => users.id, { onDelete: 'set null' }),
    remarks: text('remarks'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('staff_attendance_unique').on(t.tenantId, t.staffId, t.date)],
);
