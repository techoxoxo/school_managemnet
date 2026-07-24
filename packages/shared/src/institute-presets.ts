/**
 * P1-MOD-03 / P1-MOD-02: institute-type presets. Each type maps to the set of
 * enabled modules, a terminology pack (what a tenant calls a class/teacher/…),
 * and the default class ladder used to auto-scaffold a new tenant (P1-MOD-02).
 * A tenant's live config (tenants.config jsonb) starts from its preset and can
 * then be overridden per tenant.
 */

/** Feature/module keys that can be toggled per tenant. */
export const MODULE_KEYS = [
  'students',
  'admissions',
  'staff',
  'attendance',
  'fees',
  'exams',
  'timetable',
  'library',
  'transport',
  'hostel',
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export interface TerminologyPack {
  class: string;
  section: string;
  teacher: string;
  student: string;
  session: string;
}

export interface InstitutePreset {
  label: string;
  modules: ModuleKey[];
  terminology: TerminologyPack;
  /** Default class ladder for auto-scaffolding (name + class_type). */
  defaultClasses: Array<{ name: string; classType: string }>;
}

const range = (from: number, to: number, fn: (n: number) => { name: string; classType: string }) =>
  Array.from({ length: to - from + 1 }, (_, i) => fn(from + i));

const SCHOOL_TERMS: TerminologyPack = {
  class: 'Class',
  section: 'Section',
  teacher: 'Teacher',
  student: 'Student',
  session: 'Academic Year',
};

export const INSTITUTE_PRESETS = {
  playschool: {
    label: 'Playschool',
    modules: ['students', 'admissions', 'staff', 'attendance', 'fees'],
    terminology: { ...SCHOOL_TERMS, student: 'Child', session: 'Year' },
    defaultClasses: [
      { name: 'Playgroup', classType: 'playgroup' },
      { name: 'Nursery', classType: 'kindergarten' },
      { name: 'LKG', classType: 'kindergarten' },
      { name: 'UKG', classType: 'kindergarten' },
    ],
  },
  kindergarten: {
    label: 'Kindergarten',
    modules: ['students', 'admissions', 'staff', 'attendance', 'fees'],
    terminology: { ...SCHOOL_TERMS, student: 'Child', session: 'Year' },
    defaultClasses: [
      { name: 'Nursery', classType: 'kindergarten' },
      { name: 'LKG', classType: 'kindergarten' },
      { name: 'UKG', classType: 'kindergarten' },
    ],
  },
  school: {
    label: 'School',
    modules: ['students', 'admissions', 'staff', 'attendance', 'fees', 'exams', 'timetable'],
    terminology: SCHOOL_TERMS,
    defaultClasses: range(1, 10, (n) => ({
      name: `Grade ${n}`,
      classType: n <= 5 ? 'primary' : n <= 8 ? 'middle' : 'secondary',
    })),
  },
  k12_multi_branch: {
    label: 'K-12 (multi-branch)',
    modules: [
      'students',
      'admissions',
      'staff',
      'attendance',
      'fees',
      'exams',
      'timetable',
      'library',
      'transport',
    ],
    terminology: SCHOOL_TERMS,
    defaultClasses: range(1, 12, (n) => ({
      name: `Grade ${n}`,
      classType:
        n <= 5 ? 'primary' : n <= 8 ? 'middle' : n <= 10 ? 'secondary' : 'senior_secondary',
    })),
  },
  coaching_center: {
    label: 'Coaching center',
    modules: ['students', 'admissions', 'staff', 'attendance', 'fees', 'exams'],
    terminology: {
      class: 'Batch',
      section: 'Group',
      teacher: 'Mentor',
      student: 'Student',
      session: 'Session',
    },
    defaultClasses: [
      { name: 'Foundation', classType: 'coaching' },
      { name: 'JEE', classType: 'coaching' },
      { name: 'NEET', classType: 'coaching' },
    ],
  },
  college: {
    label: 'College',
    modules: [
      'students',
      'admissions',
      'staff',
      'attendance',
      'fees',
      'exams',
      'timetable',
      'library',
    ],
    terminology: {
      class: 'Course',
      section: 'Batch',
      teacher: 'Faculty',
      student: 'Student',
      session: 'Semester',
    },
    defaultClasses: range(1, 8, (n) => ({ name: `Semester ${n}`, classType: 'undergraduate' })),
  },
} satisfies Record<string, InstitutePreset>;
