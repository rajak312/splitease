import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  allocateByWeights,
  computeSplit,
  formatBasisPoints,
  parsePercentToBasisPoints,
  type SplitResult,
} from '../src';

const people = (...ids: string[]) => ids.map((userId) => ({ userId }));
const shares = (r: SplitResult) => {
  if (!r.ok) throw new Error(r.error);
  return Object.fromEntries(r.shares.map((s) => [s.userId, s.amount]));
};

describe('EQUAL split', () => {
  it('splits evenly when divisible', () => {
    expect(shares(computeSplit(900, 'EQUAL', people('a', 'b', 'c')))).toEqual({ a: 300, b: 300, c: 300 });
  });

  it('distributes the remainder one paisa at a time, deterministically by userId', () => {
    // ₹10.00 / 3 = 333.33… → 334, 333, 333
    expect(shares(computeSplit(1000, 'EQUAL', people('c', 'a', 'b')))).toEqual({ a: 334, b: 333, c: 333 });
    // ₹0.05 / 3 → 2, 2, 1
    expect(shares(computeSplit(5, 'EQUAL', people('a', 'b', 'c')))).toEqual({ a: 2, b: 2, c: 1 });
  });

  it('handles amounts smaller than the number of people', () => {
    expect(shares(computeSplit(2, 'EQUAL', people('a', 'b', 'c', 'd')))).toEqual({ a: 1, b: 1, c: 0, d: 0 });
  });

  it('is independent of participant order', () => {
    const a = shares(computeSplit(1001, 'EQUAL', people('x', 'y', 'z', 'w')));
    const b = shares(computeSplit(1001, 'EQUAL', people('w', 'z', 'y', 'x')));
    expect(a).toEqual(b);
  });

  it('preserves input order in the returned array', () => {
    const r = computeSplit(100, 'EQUAL', people('b', 'a'));
    expect(r.ok && r.shares.map((s) => s.userId)).toEqual(['b', 'a']);
  });
});

describe('EXACT split', () => {
  it('accepts amounts that add up to the total', () => {
    const r = computeSplit(1000, 'EXACT', [
      { userId: 'a', value: 250 },
      { userId: 'b', value: 750 },
    ]);
    expect(shares(r)).toEqual({ a: 250, b: 750 });
  });

  it('allows zero for a participant', () => {
    const r = computeSplit(1000, 'EXACT', [
      { userId: 'a', value: 0 },
      { userId: 'b', value: 1000 },
    ]);
    expect(r.ok).toBe(true);
  });

  it('reports how much is left to assign', () => {
    const under = computeSplit(1000, 'EXACT', [
      { userId: 'a', value: 300 },
      { userId: 'b', value: 600 },
    ]);
    expect(under).toMatchObject({ ok: false, remaining: 100 });
    const over = computeSplit(1000, 'EXACT', [
      { userId: 'a', value: 600 },
      { userId: 'b', value: 600 },
    ]);
    expect(over).toMatchObject({ ok: false, remaining: -200 });
  });

  it('rejects negative or fractional values', () => {
    expect(
      computeSplit(100, 'EXACT', [
        { userId: 'a', value: -1 },
        { userId: 'b', value: 101 },
      ]).ok,
    ).toBe(false);
    expect(
      computeSplit(100, 'EXACT', [
        { userId: 'a', value: 50.5 },
        { userId: 'b', value: 49.5 },
      ]).ok,
    ).toBe(false);
  });
});

describe('PERCENT split', () => {
  it('splits by basis points', () => {
    const r = computeSplit(20000, 'PERCENT', [
      { userId: 'a', value: 5000 },
      { userId: 'b', value: 2500 },
      { userId: 'c', value: 2500 },
    ]);
    expect(shares(r)).toEqual({ a: 10000, b: 5000, c: 5000 });
  });

  it('rounds with the largest-remainder method', () => {
    // 33.33% / 33.33% / 33.34% of ₹1.00
    const r = computeSplit(100, 'PERCENT', [
      { userId: 'a', value: 3333 },
      { userId: 'b', value: 3333 },
      { userId: 'c', value: 3334 },
    ]);
    expect(shares(r)).toEqual({ a: 33, b: 33, c: 34 });
  });

  it('gives the leftover paisa to the largest fractional remainder', () => {
    // 10.01 split 50/50 → 500.5 each → tie broken by id
    const r = computeSplit(1001, 'PERCENT', [
      { userId: 'b', value: 5000 },
      { userId: 'a', value: 5000 },
    ]);
    expect(shares(r)).toEqual({ a: 501, b: 500 });
  });

  it('requires exactly 100%', () => {
    const r = computeSplit(100, 'PERCENT', [
      { userId: 'a', value: 5000 },
      { userId: 'b', value: 4000 },
    ]);
    expect(r).toMatchObject({ ok: false, remaining: 1000 });
    expect(!r.ok && r.error).toContain('90%');
  });
});

describe('SHARES split', () => {
  it('splits by weight', () => {
    const r = computeSplit(1200, 'SHARES', [
      { userId: 'a', value: 2 },
      { userId: 'b', value: 1 },
      { userId: 'c', value: 1 },
    ]);
    expect(shares(r)).toEqual({ a: 600, b: 300, c: 300 });
  });

  it('rounds deterministically', () => {
    const r = computeSplit(1000, 'SHARES', [
      { userId: 'a', value: 1 },
      { userId: 'b', value: 1 },
      { userId: 'c', value: 1 },
    ]);
    expect(shares(r)).toEqual({ a: 334, b: 333, c: 333 });
  });

  it('allows a zero weight but not all zeros', () => {
    expect(
      shares(
        computeSplit(100, 'SHARES', [
          { userId: 'a', value: 0 },
          { userId: 'b', value: 3 },
        ]),
      ),
    ).toEqual({
      a: 0,
      b: 100,
    });
    expect(computeSplit(100, 'SHARES', [{ userId: 'a', value: 0 }]).ok).toBe(false);
  });
});

describe('general validation', () => {
  it('rejects zero, negative and fractional totals', () => {
    expect(computeSplit(0, 'EQUAL', people('a')).ok).toBe(false);
    expect(computeSplit(-5, 'EQUAL', people('a')).ok).toBe(false);
    expect(computeSplit(10.5, 'EQUAL', people('a')).ok).toBe(false);
  });

  it('rejects empty and duplicate participants', () => {
    expect(computeSplit(100, 'EQUAL', []).ok).toBe(false);
    expect(computeSplit(100, 'EQUAL', people('a', 'a')).ok).toBe(false);
  });
});

describe('allocateByWeights properties', () => {
  const entriesArb = fc
    .uniqueArray(
      fc.record({ userId: fc.string({ minLength: 1, maxLength: 6 }), weight: fc.integer({ min: 0, max: 1000 }) }),
      { minLength: 1, maxLength: 12, selector: (e) => e.userId },
    )
    .filter((entries) => entries.some((e) => e.weight > 0));

  it('always sums to the amount and every share is within 1 unit of its exact value', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000_000_000 }), entriesArb, (amount, entries) => {
        const result = allocateByWeights(amount, entries);
        const totalWeight = entries.reduce((s, e) => s + e.weight, 0);
        expect(result.reduce((s, r) => s + r.amount, 0)).toBe(amount);
        result.forEach((r, i) => {
          const exact = (amount * entries[i]!.weight) / totalWeight;
          expect(Number.isInteger(r.amount)).toBe(true);
          expect(Math.abs(r.amount - exact)).toBeLessThan(1);
          if (entries[i]!.weight === 0) expect(r.amount).toBe(0);
        });
      }),
    );
  });

  it('is invariant to participant order', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10_000_000 }), entriesArb, (amount, entries) => {
        const forward = new Map(allocateByWeights(amount, entries).map((r) => [r.userId, r.amount]));
        const backward = new Map(allocateByWeights(amount, [...entries].reverse()).map((r) => [r.userId, r.amount]));
        expect(backward).toEqual(forward);
      }),
    );
  });

  it('equal splits never differ by more than one minor unit', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000_000 }), fc.integer({ min: 1, max: 50 }), (amount, n) => {
        const r = computeSplit(
          amount,
          'EQUAL',
          Array.from({ length: n }, (_, i) => ({ userId: `u${i}` })),
        );
        if (!r.ok) throw new Error(r.error);
        const values = r.shares.map((s) => s.amount);
        expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
      }),
    );
  });
});

describe('percent helpers', () => {
  it('parses and formats basis points', () => {
    expect(parsePercentToBasisPoints('33.33')).toBe(3333);
    expect(parsePercentToBasisPoints('50')).toBe(5000);
    expect(parsePercentToBasisPoints('12.5%')).toBe(1250);
    expect(parsePercentToBasisPoints('1.234')).toBeNull();
    expect(formatBasisPoints(3333)).toBe('33.33');
    expect(formatBasisPoints(1250)).toBe('12.5');
    expect(formatBasisPoints(10000)).toBe('100');
  });
});
