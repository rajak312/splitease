import { MAX_AMOUNT_MINOR, sum } from './money';

export const SPLIT_MODES = ['EQUAL', 'EXACT', 'PERCENT', 'SHARES'] as const;
export type SplitMode = (typeof SPLIT_MODES)[number];

/** 100% expressed in basis points (1 bp = 0.01%). Percentages are integers. */
export const PERCENT_TOTAL_BP = 10_000;
export const MAX_SHARE_WEIGHT = 1_000;

export interface SplitParticipantInput {
  userId: string;
  /**
   * Meaning depends on the mode:
   * - EQUAL: ignored
   * - EXACT: amount in minor units
   * - PERCENT: basis points (2500 = 25%)
   * - SHARES: positive integer weight
   */
  value?: number | null;
}

export interface ShareAmount {
  userId: string;
  amount: number;
}

export type SplitResult =
  | { ok: true; shares: ShareAmount[] }
  | {
      ok: false;
      error: string;
      /**
       * For EXACT / PERCENT: how much is still unassigned (positive) or
       * over-assigned (negative), in minor units / basis points.
       */
      remaining?: number;
    };

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Allocate `amount` proportionally to integer `weights` using the
 * largest-remainder (Hamilton) method:
 *
 * 1. everyone gets floor(amount * w / W)
 * 2. the few leftover minor units go, one each, to the participants with the
 *    largest fractional remainder; ties are broken by userId so the result is
 *    deterministic and independent of input order.
 *
 * The result always sums to exactly `amount`, and no share differs from its
 * exact proportional value by one minor unit or more.
 */
export function allocateByWeights(
  amount: number,
  entries: readonly { userId: string; weight: number }[],
): ShareAmount[] {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError('amount must be a non-negative safe integer');
  }
  if (entries.length === 0) return [];
  const totalWeight = sum(entries.map((e) => e.weight));
  if (totalWeight <= 0) throw new RangeError('total weight must be positive');

  const rows = entries.map((e, index) => {
    const numerator = amount * e.weight;
    if (!Number.isSafeInteger(numerator)) throw new RangeError('amount * weight overflows');
    return {
      index,
      userId: e.userId,
      amount: Math.floor(numerator / totalWeight),
      remainder: numerator % totalWeight,
    };
  });

  let leftover = amount - sum(rows.map((r) => r.amount));
  const order = [...rows].sort((a, b) => b.remainder - a.remainder || compareIds(a.userId, b.userId));
  for (const row of order) {
    if (leftover <= 0) break;
    row.amount += 1;
    leftover -= 1;
  }

  return rows.map(({ userId, amount: share }) => ({ userId, amount: share }));
}

function fail(error: string, remaining?: number): SplitResult {
  return remaining === undefined ? { ok: false, error } : { ok: false, error, remaining };
}

/**
 * Turn an expense amount + split definition into per-person owed amounts.
 * This is the single source of truth used by the client (live preview and
 * validation) and the server (persisted `ExpenseShare` rows).
 */
export function computeSplit(
  amount: number,
  mode: SplitMode,
  participants: readonly SplitParticipantInput[],
): SplitResult {
  if (!Number.isSafeInteger(amount) || amount <= 0) return fail('Amount must be greater than zero');
  if (amount > MAX_AMOUNT_MINOR) return fail('Amount is too large');
  if (participants.length === 0) return fail('Choose at least one person to split with');

  const ids = new Set(participants.map((p) => p.userId));
  if (ids.size !== participants.length) return fail('Each person can only appear once in a split');

  switch (mode) {
    case 'EQUAL':
      return {
        ok: true,
        shares: allocateByWeights(
          amount,
          participants.map((p) => ({ userId: p.userId, weight: 1 })),
        ),
      };

    case 'EXACT': {
      const values = participants.map((p) => p.value ?? 0);
      if (values.some((v) => !Number.isSafeInteger(v) || v < 0)) {
        return fail('Exact amounts must be zero or more');
      }
      const total = sum(values);
      if (total !== amount) {
        return fail(
          total < amount ? 'Exact amounts are less than the total' : 'Exact amounts are more than the total',
          amount - total,
        );
      }
      return {
        ok: true,
        shares: participants.map((p, i) => ({ userId: p.userId, amount: values[i] ?? 0 })),
      };
    }

    case 'PERCENT': {
      const values = participants.map((p) => p.value ?? 0);
      if (values.some((v) => !Number.isSafeInteger(v) || v < 0 || v > PERCENT_TOTAL_BP)) {
        return fail('Percentages must be between 0 and 100');
      }
      const total = sum(values);
      if (total !== PERCENT_TOTAL_BP) {
        return fail(
          `Percentages must add up to 100% (currently ${formatBasisPoints(total)}%)`,
          PERCENT_TOTAL_BP - total,
        );
      }
      return {
        ok: true,
        shares: allocateByWeights(
          amount,
          participants.map((p, i) => ({ userId: p.userId, weight: values[i] ?? 0 })),
        ),
      };
    }

    case 'SHARES': {
      const values = participants.map((p) => p.value ?? 0);
      if (values.some((v) => !Number.isSafeInteger(v) || v < 0 || v > MAX_SHARE_WEIGHT)) {
        return fail(`Shares must be whole numbers between 0 and ${MAX_SHARE_WEIGHT}`);
      }
      if (sum(values) === 0) return fail('At least one person needs a share');
      return {
        ok: true,
        shares: allocateByWeights(
          amount,
          participants.map((p, i) => ({ userId: p.userId, weight: values[i] ?? 0 })),
        ),
      };
    }

    default: {
      const exhaustive: never = mode;
      return fail(`Unknown split mode ${String(exhaustive)}`);
    }
  }
}

/** 3333 -> "33.33", 10000 -> "100" */
export function formatBasisPoints(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const frac = Math.abs(bp % 100);
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}`;
}

/** "33.33" -> 3333; returns null for invalid input or more than 2 decimals. */
export function parsePercentToBasisPoints(input: string): number | null {
  const cleaned = input.trim().replace(/%$/, '');
  const match = /^(\d*)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match || cleaned === '' || cleaned === '.') return null;
  const [, whole = '', frac = ''] = match;
  return Number(whole || '0') * 100 + Number((frac + '00').slice(0, 2));
}
