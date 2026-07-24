/**
 * Sidebar navigation config (P0-WEB-04). `permission` gates visibility —
 * items the user cannot use are hidden entirely (PQC #5).
 * Grows as modules land; the shell renders whatever is visible for the role.
 */
export interface NavItem {
  label: string;
  href: string;
  icon: 'dashboard' | 'branches' | 'students' | 'attendance' | 'settings';
  permission: string | null; // null = any authenticated user
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: 'dashboard', permission: null },
  { label: 'Branches', href: '/branches', icon: 'branches', permission: 'branch.view' },
  { label: 'Staff', href: '/staff', icon: 'students', permission: 'staff.view' },
  { label: 'Attendance', href: '/attendance', icon: 'attendance', permission: 'attendance.view' },
];
