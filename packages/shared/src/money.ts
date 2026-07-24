/**
 * P2-MOD-02: money math. EVERY amount is minor units (paise/cents) as a safe
 * integer — never floats, never major units. All functions are pure and total
 * (they validate inputs and throw on nonsense) so fee math is audit-grade.
 * Plan §25 risk #3.
 */

function assertInt(n: number, name: string): void {
  if (!Number.isSafeInteger(n)) {
    throw new Error(`${name} must be a safe integer in minor units, got ${n}`);
  }
}

/** Sum minor-unit amounts. */
export function sumMinor(amounts: readonly number[]): number {
  return amounts.reduce((acc, n) => {
    assertInt(n, 'amount');
    return acc + n;
  }, 0);
}

/**
 * Split `total` into `parts` installments whose sum is EXACTLY `total`.
 * The remainder (total mod parts) is spread one unit at a time onto the
 * earliest installments, so no cent is created or lost. Sign-preserving.
 */
export function distribute(total: number, parts: number): number[] {
  assertInt(total, 'total');
  if (!Number.isInteger(parts) || parts < 1) {
    throw new Error(`parts must be an integer >= 1, got ${parts}`);
  }
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const base = Math.floor(abs / parts);
  const remainder = abs - base * parts;
  return Array.from({ length: parts }, (_, i) => sign * (base + (i < remainder ? 1 : 0)));
}

/**
 * Amount owed by someone present for only `remaining` of `totalPeriods`
 * periods (mid-year admission). Equals the sum of the smaller tail
 * installments of a `totalPeriods`-way split, so it never disagrees with a
 * full-term student's schedule by a rounding cent.
 */
export function prorateByPeriods(
  total: number,
  totalPeriods: number,
  remainingPeriods: number,
): number {
  if (!Number.isInteger(totalPeriods) || totalPeriods < 1) {
    throw new Error(`totalPeriods must be an integer >= 1, got ${totalPeriods}`);
  }
  if (
    !Number.isInteger(remainingPeriods) ||
    remainingPeriods < 0 ||
    remainingPeriods > totalPeriods
  ) {
    throw new Error(
      `remainingPeriods must be between 0 and ${totalPeriods}, got ${remainingPeriods}`,
    );
  }
  if (remainingPeriods === 0) return 0;
  const parts = distribute(total, totalPeriods);
  return sumMinor(parts.slice(totalPeriods - remainingPeriods));
}

export type DiscountValueType = 'flat' | 'percent';

/**
 * Apply a discount to `amount`. `flat` value is minor units; `percent` value
 * is basis points (10000 = 100%). The discount is clamped to [0, amount], so
 * the net is never negative and never exceeds the original.
 */
export function applyDiscount(
  amount: number,
  valueType: DiscountValueType,
  value: number,
): { discount: number; net: number } {
  assertInt(amount, 'amount');
  if (amount < 0) throw new Error('amount must be >= 0');
  if (value < 0) throw new Error('discount value must be >= 0');

  let discount: number;
  if (valueType === 'flat') {
    assertInt(value, 'discount value');
    discount = value;
  } else if (valueType === 'percent') {
    discount = Math.round((amount * value) / 10000);
  } else {
    throw new Error(`unknown discount valueType: ${valueType as string}`);
  }
  discount = Math.min(Math.max(discount, 0), amount);
  return { discount, net: amount - discount };
}

/** Whole periods a payment is overdue (e.g. per-month late fee). */
export function periodsOverdue(daysLate: number, perPeriodDays: number): number {
  if (perPeriodDays < 1) throw new Error('perPeriodDays must be >= 1');
  if (daysLate <= 0) return 0;
  return Math.floor(daysLate / perPeriodDays);
}

export type LateFeeMode = 'flat_per_period' | 'percent_per_period';

/**
 * Late fee for an overdue amount. `flat_per_period` charges `value` minor
 * units per overdue period; `percent_per_period` charges `value` basis points
 * of the overdue amount per period. Optional `cap` bounds the total.
 */
export function computeLateFee(params: {
  overdueAmount: number;
  mode: LateFeeMode;
  value: number;
  periods: number;
  cap?: number;
}): number {
  const { overdueAmount, mode, value, periods, cap } = params;
  assertInt(overdueAmount, 'overdueAmount');
  if (overdueAmount <= 0 || periods <= 0 || value <= 0) return 0;

  let fee: number;
  if (mode === 'flat_per_period') {
    fee = value * periods;
  } else if (mode === 'percent_per_period') {
    fee = Math.round((overdueAmount * value) / 10000) * periods;
  } else {
    throw new Error(`unknown late-fee mode: ${mode as string}`);
  }
  if (cap != null) fee = Math.min(fee, cap);
  return Math.max(0, fee);
}

/** What's still owed after discount and payments (never negative). */
export function outstanding(amountDue: number, amountPaid: number, discount = 0): number {
  assertInt(amountDue, 'amountDue');
  assertInt(amountPaid, 'amountPaid');
  assertInt(discount, 'discount');
  return Math.max(0, amountDue - discount - amountPaid);
}

/** Derive a due's status from its numbers. */
export function dueStatus(
  amountDue: number,
  amountPaid: number,
  discount = 0,
): 'paid' | 'partial' | 'pending' {
  const owed = outstanding(amountDue, amountPaid, discount);
  if (owed === 0) return 'paid';
  if (amountPaid > 0) return 'partial';
  return 'pending';
}

/** Format minor units as major with a fixed 2-decimal string (display only). */
export function formatMinor(minor: number, fractionDigits = 2): string {
  assertInt(minor, 'minor');
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const divisor = 10 ** fractionDigits;
  const whole = Math.floor(abs / divisor);
  const frac = String(abs % divisor).padStart(fractionDigits, '0');
  return `${sign}${whole}.${frac}`;
}
