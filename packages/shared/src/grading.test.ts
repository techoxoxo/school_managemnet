import { describe, expect, it } from 'vitest';
import { GRADING_PRESETS, gradeForPercentage } from './grading.js';

describe('gradeForPercentage', () => {
  const cbse = GRADING_PRESETS.cbse.scale;

  it('maps marks to CBSE bands', () => {
    expect(gradeForPercentage(cbse, 95)?.grade).toBe('A1');
    expect(gradeForPercentage(cbse, 91)?.grade).toBe('A1');
    expect(gradeForPercentage(cbse, 90)?.grade).toBe('A2');
    expect(gradeForPercentage(cbse, 33)?.grade).toBe('D');
    expect(gradeForPercentage(cbse, 32)?.grade).toBe('E');
    expect(gradeForPercentage(cbse, 0)?.grade).toBe('E');
  });

  it('handles fractional marks (lands in the lower band)', () => {
    expect(gradeForPercentage(cbse, 90.5)?.grade).toBe('A2');
  });

  it('returns points for GPA', () => {
    expect(gradeForPercentage(GRADING_PRESETS.gpa4.scale, 95)?.points).toBe(4);
    expect(gradeForPercentage(GRADING_PRESETS.gpa4.scale, 59)?.grade).toBe('F');
  });

  it('percentage preset is pass/fail at 33', () => {
    expect(gradeForPercentage(GRADING_PRESETS.percentage.scale, 33)?.grade).toBe('Pass');
    expect(gradeForPercentage(GRADING_PRESETS.percentage.scale, 32)?.grade).toBe('Fail');
  });

  it('empty scale returns null', () => {
    expect(gradeForPercentage([], 50)).toBeNull();
  });
});
