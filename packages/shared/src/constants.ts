/** Built-in roles (Plan §4.B). Custom roles extend these per tenant. */
export const Roles = {
  SUPER_ADMIN: 'super_admin',
  TENANT_ADMIN: 'tenant_admin',
  BRANCH_ADMIN: 'branch_admin',
  TEACHER: 'teacher',
  ACCOUNTANT: 'accountant',
  LIBRARIAN: 'librarian',
  HOSTEL_WARDEN: 'hostel_warden',
  TRANSPORT_MANAGER: 'transport_manager',
  RECEPTIONIST: 'receptionist',
  COUNSELOR: 'counselor',
  STUDENT: 'student',
  PARENT: 'parent',
  CUSTOM: 'custom',
} as const;

export type Role = (typeof Roles)[keyof typeof Roles];

/** Institute-type presets (Plan §15). */
export const InstituteTypes = {
  PLAYSCHOOL: 'playschool',
  KINDERGARTEN: 'kindergarten',
  SCHOOL: 'school',
  K12_MULTI_BRANCH: 'k12_multi_branch',
  COACHING_CENTER: 'coaching_center',
  COLLEGE: 'college',
} as const;

export type InstituteType = (typeof InstituteTypes)[keyof typeof InstituteTypes];

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;
