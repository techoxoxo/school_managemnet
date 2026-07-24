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

export const genderEnum = pgEnum('gender', ['male', 'female', 'other']);

export const studentStatusEnum = pgEnum('student_status', [
  'active',
  'alumni',
  'transferred',
  'expelled',
  'dropout',
  'passout',
]);

export const parentRelationEnum = pgEnum('parent_relation', [
  'father',
  'mother',
  'guardian',
  'other',
]);

export const admissionStatusEnum = pgEnum('admission_status', [
  'applied',
  'under_review',
  'shortlisted',
  'interview',
  'offered',
  'accepted',
  'rejected',
  'withdrawn',
  'enrolled',
]);

export const notificationChannelEnum = pgEnum('notification_channel', [
  'in_app',
  'email',
  'sms',
  'push',
  'whatsapp',
]);

export const notificationStatusEnum = pgEnum('notification_status', [
  'queued',
  'sent',
  'delivered',
  'failed',
  'skipped',
]);

export const employmentTypeEnum = pgEnum('employment_type', [
  'permanent',
  'contract',
  'part_time',
  'visiting',
]);

export const staffStatusEnum = pgEnum('staff_status', [
  'active',
  'on_leave',
  'resigned',
  'terminated',
  'retired',
]);

export const studentAttendanceStatusEnum = pgEnum('student_attendance_status', [
  'present',
  'absent',
  'late',
  'half_day',
  'excused',
  'holiday',
]);

export const staffAttendanceStatusEnum = pgEnum('staff_attendance_status', [
  'present',
  'absent',
  'half_day',
  'late',
  'on_leave',
  'holiday',
  'weekend',
]);

export const attendanceSourceEnum = pgEnum('attendance_source', [
  'manual',
  'biometric',
  'app',
  'qr',
  'rfid',
]);

export const attendanceTypeEnum = pgEnum('attendance_type', ['daily', 'period_wise']);
