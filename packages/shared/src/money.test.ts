import { describe, expect, it } from 'vitest';
import {
  applyDiscount,
  computeLateFee,
  distribute,
  dueStatus,
  formatMinor,
  outstanding,
  periodsOverdue,
  prorateByPeriods,
  sumMinor,
} from './money.js';

describe('distribute', () => {
  it('splits evenly when divisible', () => {
    expect(distribute(1200, 12)).toEqual(Array(12).fill(100));
  });

  it('spreads the remainder onto the earliest installments and always sums to total', () => {
    const parts = distribute(100, 3); // 34, 33, 33
    expect(parts).toEqual([34, 33, 33]);
    expect(sumMinor(parts)).toBe(100);
  });

  it('handles a single installment', () => {
    expect(distribute(999, 1)).toEqual([999]);
  });

  it('handles zero', () => {
    expect(distribute(0, 4)).toEqual([0, 0, 0, 0]);
  });

  it('preserves sign for refunds/credits', () => {
    const parts = distribute(-100, 3);
    expect(parts).toEqual([-34, -33, -33]);
    expect(sumMinor(parts)).toBe(-100);
  });

  it('never loses a cent for awkward divisions', () => {
    for (const total of [1, 7, 101, 999, 10001]) {
      for (const parts of [1, 2, 3, 7, 12]) {
        expect(sumMinor(distribute(total, parts))).toBe(total);
      }
    }
  });

  it('rejects non-integer totals and bad part counts', () => {
    expect(() => distribute(10.5, 2)).toThrow();
    expect(() => distribute(100, 0)).toThrow();
    expect(() => distribute(100, -1)).toThrow();
  });
});

describe('prorateByPeriods', () => {
  it('full term equals the total', () => {
    expect(prorateByPeriods(1200, 12, 12)).toBe(1200);
  });

  it('zero remaining owes nothing', () => {
    expect(prorateByPeriods(1200, 12, 0)).toBe(0);
  });

  it('mid-year admission owes the tail installments', () => {
    // 100 over 3 → [34,33,33]; joining for the last 2 → 33+33 = 66
    expect(prorateByPeriods(100, 3, 2)).toBe(66);
  });

  it('a full-term + a mid-term split never disagree with the total', () => {
    const total = 10001;
    const early = total - prorateByPeriods(total, 12, 5); // first 7 months
    const late = prorateByPeriods(total, 12, 5); // last 5 months
    expect(early + late).toBe(total);
  });

  it('rejects out-of-range periods', () => {
    expect(() => prorateByPeriods(1200, 12, 13)).toThrow();
    expect(() => prorateByPeriods(1200, 0, 0)).toThrow();
  });
});

describe('applyDiscount', () => {
  it('applies a flat discount', () => {
    expect(applyDiscount(10000, 'flat', 1500)).toEqual({ discount: 1500, net: 8500 });
  });

  it('applies a percentage in basis points', () => {
    expect(applyDiscount(10000, 'percent', 2500)).toEqual({ discount: 2500, net: 7500 }); // 25%
  });

  it('rounds percentage half-up', () => {
    // 10% of 155 = 15.5 → 16
    expect(applyDiscount(155, 'percent', 1000).discount).toBe(16);
  });

  it('clamps a flat discount to the amount (never negative net)', () => {
    expect(applyDiscount(5000, 'flat', 9999)).toEqual({ discount: 5000, net: 0 });
  });

  it('clamps percentages over 100%', () => {
    expect(applyDiscount(5000, 'percent', 20000)).toEqual({ discount: 5000, net: 0 });
  });

  it('rejects negative inputs and unknown types', () => {
    expect(() => applyDiscount(-1, 'flat', 0)).toThrow();
    expect(() => applyDiscount(100, 'flat', -5)).toThrow();
    // @ts-expect-error invalid type
    expect(() => applyDiscount(100, 'bogus', 5)).toThrow();
  });
});

describe('periodsOverdue', () => {
  it('counts whole periods only', () => {
    expect(periodsOverdue(0, 30)).toBe(0);
    expect(periodsOverdue(29, 30)).toBe(0);
    expect(periodsOverdue(30, 30)).toBe(1);
    expect(periodsOverdue(75, 30)).toBe(2);
  });
  it('rejects a bad period length', () => {
    expect(() => periodsOverdue(30, 0)).toThrow();
  });
});

describe('computeLateFee', () => {
  it('flat per period', () => {
    expect(
      computeLateFee({ overdueAmount: 10000, mode: 'flat_per_period', value: 5000, periods: 3 }),
    ).toBe(15000);
  });

  it('percent per period (basis points of the overdue amount)', () => {
    // 2% of 10000 = 200 per period × 2 = 400
    expect(
      computeLateFee({ overdueAmount: 10000, mode: 'percent_per_period', value: 200, periods: 2 }),
    ).toBe(400);
  });

  it('honours the cap', () => {
    expect(
      computeLateFee({
        overdueAmount: 10000,
        mode: 'flat_per_period',
        value: 5000,
        periods: 10,
        cap: 20000,
      }),
    ).toBe(20000);
  });

  it('is zero when nothing is overdue', () => {
    expect(
      computeLateFee({ overdueAmount: 0, mode: 'flat_per_period', value: 5000, periods: 3 }),
    ).toBe(0);
    expect(
      computeLateFee({ overdueAmount: 100, mode: 'flat_per_period', value: 5000, periods: 0 }),
    ).toBe(0);
  });
});

describe('outstanding & dueStatus', () => {
  it('subtracts discount and payments, flooring at zero', () => {
    expect(outstanding(10000, 3000, 1000)).toBe(6000);
    expect(outstanding(10000, 10000)).toBe(0);
    expect(outstanding(10000, 99999)).toBe(0);
  });

  it('derives status', () => {
    expect(dueStatus(10000, 0)).toBe('pending');
    expect(dueStatus(10000, 4000)).toBe('partial');
    expect(dueStatus(10000, 9000, 1000)).toBe('paid');
    expect(dueStatus(10000, 0, 10000)).toBe('paid'); // fully waived
  });
});

describe('formatMinor', () => {
  it('formats minor units to a 2-decimal string', () => {
    expect(formatMinor(123456)).toBe('1234.56');
    expect(formatMinor(5)).toBe('0.05');
    expect(formatMinor(0)).toBe('0.00');
    expect(formatMinor(-2500)).toBe('-25.00');
  });
});
