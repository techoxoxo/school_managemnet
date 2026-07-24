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
import {
  admissionStatusEnum,
  documentStatusEnum,
  documentTypeEnum,
  genderEnum,
  parentRelationEnum,
  studentStatusEnum,
} from './enums.js';
import { academicSessions, branches, tenants } from './tenants.js';
import { classes, sections } from './academics.js';
import { importBatches } from './imports.js';
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
    /** Set when created via bulk import — enables rollback (P1-MOD-16). */
    importBatchId: uuid('import_batch_id').references(() => importBatches.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('students_admission_number_unique').on(t.tenantId, t.admissionNumber)],
);

/**
 * Tenant-scoped (RLS). Admission applications (Plan §4.C, P1-MOD-12).
 * A pipeline that ends by converting an accepted application into a student.
 */
export const admissions = pgTable(
  'admissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    applicationNumber: text('application_number').notNull(),
    applicantFirstName: text('applicant_first_name').notNull(),
    applicantLastName: text('applicant_last_name'),
    dateOfBirth: date('date_of_birth'),
    gender: genderEnum('gender'),
    classAppliedFor: uuid('class_applied_for').references(() => classes.id, {
      onDelete: 'set null',
    }),
    academicSessionId: uuid('academic_session_id').references(() => academicSessions.id, {
      onDelete: 'set null',
    }),
    guardianName: text('guardian_name'),
    guardianPhone: text('guardian_phone'),
    guardianEmail: text('guardian_email'),
    previousSchoolName: text('previous_school_name'),
    status: admissionStatusEnum('status').notNull().default('applied'),
    statusReason: text('status_reason'),
    notes: text('notes'),
    /** Set when the application is converted (status → enrolled). */
    convertedStudentId: uuid('converted_student_id').references(() => students.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('admissions_application_number_unique').on(t.tenantId, t.applicationNumber)],
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
  /** Set when created via bulk import — enables rollback (P1-MOD-16). */
  importBatchId: uuid('import_batch_id').references(() => importBatches.id, {
    onDelete: 'set null',
  }),
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

/** Tenant-scoped (RLS). Student documents (P1-MOD-10). Binary lives in S3/MinIO;
 * this row is metadata + verification state. `storage_key` is the object key. */
export const studentDocuments = pgTable('student_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id')
    .notNull()
    .references(() => students.id, { onDelete: 'cascade' }),
  docType: documentTypeEnum('doc_type').notNull(),
  fileName: text('file_name').notNull(),
  storageKey: text('storage_key').notNull(),
  contentType: text('content_type'),
  sizeBytes: bigint('size_bytes', { mode: 'number' }),
  status: documentStatusEnum('status').notNull().default('pending'),
  remarks: text('remarks'),
  uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  verifiedBy: uuid('verified_by').references(() => users.id, { onDelete: 'set null' }),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
