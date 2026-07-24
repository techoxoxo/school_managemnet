/**
 * P2-MOD-13: grading systems. A scale is an ordered set of bands; a percentage
 * maps to the band whose [min,max] it falls in. Presets cover CBSE, a 4.0 GPA,
 * and a simple pass/fail percentage; tenants can also build custom scales.
 */
export interface GradeBand {
  grade: string;
  min: number; // inclusive lower bound (percent)
  max: number; // inclusive upper bound (percent)
  points: number;
}
export type GradingScale = GradeBand[];
export type GradingType = 'percentage' | 'gpa' | 'letter';

export interface GradingPreset {
  key: string;
  name: string;
  type: GradingType;
  scale: GradingScale;
}

const CBSE: GradingScale = [
  { grade: 'A1', min: 91, max: 100, points: 10 },
  { grade: 'A2', min: 81, max: 90, points: 9 },
  { grade: 'B1', min: 71, max: 80, points: 8 },
  { grade: 'B2', min: 61, max: 70, points: 7 },
  { grade: 'C1', min: 51, max: 60, points: 6 },
  { grade: 'C2', min: 41, max: 50, points: 5 },
  { grade: 'D', min: 33, max: 40, points: 4 },
  { grade: 'E', min: 0, max: 32, points: 0 },
];

const GPA4: GradingScale = [
  { grade: 'A', min: 90, max: 100, points: 4 },
  { grade: 'B', min: 80, max: 89, points: 3 },
  { grade: 'C', min: 70, max: 79, points: 2 },
  { grade: 'D', min: 60, max: 69, points: 1 },
  { grade: 'F', min: 0, max: 59, points: 0 },
];

const PERCENTAGE: GradingScale = [
  { grade: 'Pass', min: 33, max: 100, points: 1 },
  { grade: 'Fail', min: 0, max: 32, points: 0 },
];

export const GRADING_PRESETS = {
  cbse: { key: 'cbse', name: 'CBSE (A1–E)', type: 'letter', scale: CBSE },
  gpa4: { key: 'gpa4', name: 'GPA 4.0', type: 'gpa', scale: GPA4 },
  percentage: {
    key: 'percentage',
    name: 'Percentage (Pass/Fail)',
    type: 'percentage',
    scale: PERCENTAGE,
  },
} satisfies Record<string, GradingPreset>;

export type GradingPresetKey = keyof typeof GRADING_PRESETS;

/**
 * Map a percentage (0–100, may be fractional) to its grade band. Bands are
 * matched by descending lower bound, so fractional marks land in the right
 * band; below the lowest band, the lowest band is returned.
 */
export function gradeForPercentage(scale: GradingScale, percent: number): GradeBand | null {
  if (scale.length === 0) return null;
  const sorted = [...scale].sort((a, b) => b.min - a.min);
  for (const band of sorted) {
    if (percent >= band.min) return band;
  }
  return sorted[sorted.length - 1] ?? null;
}
