import { pgEnum } from 'drizzle-orm/pg-core';

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trial',
  'active',
  'past_due',
  'suspended',
  'churned',
]);

export const billingCycleEnum = pgEnum('billing_cycle', ['monthly', 'annual']);

export const userStatusEnum = pgEnum('user_status', ['active', 'inactive', 'suspended']);

export const roleEnum = pgEnum('role', [
  'super_admin',
  'tenant_admin',
  'branch_admin',
  'teacher',
  'accountant',
  'librarian',
  'hostel_warden',
  'transport_manager',
  'receptionist',
  'counselor',
  'student',
  'parent',
  'custom',
]);

export const loginStatusEnum = pgEnum('login_status', ['success', 'failed', 'blocked']);

export const instituteTypeEnum = pgEnum('institute_type', [
  'playschool',
  'kindergarten',
  'school',
  'k12_multi_branch',
  'coaching_center',
  'college',
]);

export const classTypeEnum = pgEnum('class_type', [
  'playgroup',
  'kindergarten',
  'primary',
  'middle',
  'secondary',
  'senior_secondary',
  'undergraduate',
  'postgraduate',
  'coaching',
]);

export const subjectTypeEnum = pgEnum('subject_type', [
  'core',
  'elective',
  'language',
  'vocational',
  'co_curricular',
  'lab',
]);
