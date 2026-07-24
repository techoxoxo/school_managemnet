/**
 * Sidebar navigation config (P0-WEB-04). `permission` gates visibility —
 * items the user cannot use are hidden entirely (PQC #5).
 * Grows as modules land; the shell renders whatever is visible for the role.
 */
export interface NavItem {
  label: string;
  href: string;
  icon:
    | 'dashboard'
    | 'branches'
    | 'students'
    | 'staff'
    | 'attendance'
    | 'import'
    | 'fees'
    | 'exams'
    | 'settings';
  permission: string | null; // null = any authenticated user
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: 'dashboard', permission: null },
  { label: 'Branches', href: '/branches', icon: 'branches', permission: 'branch.view' },
  { label: 'Students', href: '/students', icon: 'students', permission: 'student.view' },
  { label: 'Staff', href: '/staff', icon: 'staff', permission: 'staff.view' },
  { label: 'Attendance', href: '/attendance', icon: 'attendance', permission: 'attendance.view' },
  { label: 'Fees', href: '/fees', icon: 'fees', permission: 'fee.view' },
  { label: 'Marks', href: '/marks', icon: 'exams', permission: 'exam.view' },
  { label: 'Import', href: '/import', icon: 'import', permission: 'student.manage' },
];
