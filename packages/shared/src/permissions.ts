import type { Role } from './constants.js';

/**
 * Permission format: `module.action` (Plan §5).
 * This catalog grows with each module; the permission-matrix CI test keeps
 * every API route declared against it.
 */
export const PERMISSIONS = {
  // Branches
  BRANCH_VIEW: 'branch.view',
  BRANCH_MANAGE: 'branch.manage',
  // Academic sessions
  SESSION_VIEW: 'session.view',
  SESSION_MANAGE: 'session.manage',
  // Classes & sections
  CLASS_VIEW: 'class.view',
  CLASS_MANAGE: 'class.manage',
  // Subjects
  SUBJECT_VIEW: 'subject.view',
  SUBJECT_MANAGE: 'subject.manage',
  // Students
  STUDENT_VIEW: 'student.view',
  STUDENT_MANAGE: 'student.manage',
  /** Decrypt CRITICAL fields (govt ID) — separate from student.view. */
  STUDENT_VIEW_SENSITIVE: 'student.view_sensitive',
  // Parents
  PARENT_VIEW: 'parent.view',
  PARENT_MANAGE: 'parent.manage',
  // Staff / HR
  STAFF_VIEW: 'staff.view',
  STAFF_MANAGE: 'staff.manage',
  STAFF_VIEW_SENSITIVE: 'staff.view_sensitive',
  // Attendance
  ATTENDANCE_VIEW: 'attendance.view',
  ATTENDANCE_MARK: 'attendance.mark',
  ATTENDANCE_MANAGE: 'attendance.manage',
  // Users & roles
  USER_VIEW: 'user.view',
  USER_MANAGE: 'user.manage',
  ROLE_MANAGE: 'role.manage',
  // Audit
  AUDIT_VIEW: 'audit.view',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Default permission sets per built-in role. `*` = everything.
 * Tenants extend via custom roles and per-user overrides
 * (user_tenant_roles.permissions), which are ADDITIVE.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, string[]> = {
  super_admin: ['*'],
  tenant_admin: ['*'],
  branch_admin: [
    'branch.view',
    'session.*',
    'class.*',
    'subject.*',
    'student.*',
    'parent.*',
    'staff.*',
    'attendance.*',
    'user.view',
    'audit.view',
  ],
  teacher: [
    'branch.view',
    'session.view',
    'class.view',
    'subject.view',
    'student.view',
    'parent.view',
    'staff.view',
    'attendance.view',
    'attendance.mark',
  ],
  accountant: ['branch.view', 'session.view', 'student.view', 'parent.view', 'staff.view'],
  librarian: ['branch.view', 'session.view', 'student.view'],
  hostel_warden: ['branch.view', 'session.view', 'student.view'],
  transport_manager: ['branch.view', 'session.view', 'student.view'],
  receptionist: ['branch.view', 'session.view', 'class.view', 'student.*', 'parent.*'],
  counselor: ['branch.view', 'session.view', 'class.view', 'student.view', 'parent.view'],
  student: [],
  parent: [],
  custom: [],
};

/**
 * Checks `granted` (may contain `*` and `module.*` wildcards) against a
 * required `module.action` permission.
 */
export function hasPermission(granted: readonly string[], required: string): boolean {
  if (granted.includes('*')) return true;
  if (granted.includes(required)) return true;
  const module = required.split('.')[0];
  return granted.includes(`${module}.*`);
}

/** Effective permissions = role defaults + additive overrides. */
export function resolvePermissions(role: Role, overrides: readonly string[] = []): string[] {
  const base = DEFAULT_ROLE_PERMISSIONS[role] ?? [];
  return [...new Set([...base, ...overrides])];
}
