import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { computeNetBalances, computeSplit, simplifyDebts, transfersFor, type NetBalance } from '../src';

describe('computeNetBalances', () => {
  it('credits the payer and debits each share', () => {
    const balances = computeNetBalances(
      ['a', 'b', 'c'],
      [
        {
          paidById: 'a',
          amount: 900,
          shares: [
            { userId: 'a', amount: 300 },
            { userId: 'b', amount: 300 },
            { userId: 'c', amount: 300 },
          ],
        },
      ],
    );
    expect(balances).toEqual([
      { userId: 'a', net: 600 },
      { userId: 'b', net: -300 },
      { userId: 'c', net: -300 },
    ]);
  });

  it('applies settlements', () => {
    const balances = computeNetBalances(
      ['a', 'b'],
      [
        {
          paidById: 'a',
          amount: 1000,
          shares: [
            { userId: 'a', amount: 500 },
            { userId: 'b', amount: 500 },
          ],
        },
      ],
      [{ fromUserId: 'b', toUserId: 'a', amount: 500 }],
    );
    expect(balances.every((b) => b.net === 0)).toBe(true);
  });

  it('includes members with no activity at zero', () => {
    expect(computeNetBalances(['z'], [])).toEqual([{ userId: 'z', net: 0 }]);
  });
});

describe('simplifyDebts', () => {
  it('collapses a chain A→B→C into a single transfer', () => {
    // a owes b 100, b owes c 100  ⇒ a pays c 100
    const transfers = simplifyDebts([
      { userId: 'a', net: -100 },
      { userId: 'b', net: 0 },
      { userId: 'c', net: 100 },
    ]);
    expect(transfers).toEqual([{ fromUserId: 'a', toUserId: 'c', amount: 100 }]);
  });

  it('matches largest debtor with largest creditor', () => {
    const transfers = simplifyDebts([
      { userId: 'a', net: 500 },
      { userId: 'b', net: 300 },
      { userId: 'c', net: -600 },
      { userId: 'd', net: -200 },
    ]);
    expect(transfers).toEqual([
      { fromUserId: 'c', toUserId: 'a', amount: 500 },
      { fromUserId: 'd', toUserId: 'b', amount: 200 },
      { fromUserId: 'c', toUserId: 'b', amount: 100 },
    ]);
  });

  it('returns nothing when everyone is settled', () => {
    expect(
      simplifyDebts([
        { userId: 'a', net: 0 },
        { userId: 'b', net: 0 },
      ]),
    ).toEqual([]);
  });

  it('rejects balances that do not sum to zero', () => {
    expect(() => simplifyDebts([{ userId: 'a', net: 1 }])).toThrow(RangeError);
  });

  it('is deterministic on ties', () => {
    const input: NetBalance[] = [
      { userId: 'b', net: -100 },
      { userId: 'a', net: -100 },
      { userId: 'd', net: 100 },
      { userId: 'c', net: 100 },
    ];
    expect(simplifyDebts(input)).toEqual(simplifyDebts([...input].reverse()));
    expect(simplifyDebts(input)[0]).toEqual({ fromUserId: 'a', toUserId: 'c', amount: 100 });
  });

  it('summarises a member perspective', () => {
    const t = [
      { fromUserId: 'a', toUserId: 'b', amount: 100 },
      { fromUserId: 'c', toUserId: 'a', amount: 40 },
    ];
    expect(transfersFor('a', t)).toMatchObject({ totalOwes: 100, totalOwed: 40 });
  });
});

/** Arbitrary zero-sum balance sheet built from random expenses, like a real group. */
const groupArb = fc
  .integer({ min: 2, max: 10 })
  .chain((n) => {
    const ids = Array.from({ length: n }, (_, i) => `user-${i}`);
    const expenseArb = fc.record({
      payer: fc.integer({ min: 0, max: n - 1 }),
      amount: fc.integer({ min: 1, max: 10_000_000 }),
      participants: fc.subarray(ids, { minLength: 1 }),
    });
    return fc.tuple(fc.constant(ids), fc.array(expenseArb, { maxLength: 30 }));
  })
  .map(([ids, raw]) => {
    const expenses = raw.map((e) => {
      const split = computeSplit(
        e.amount,
        'EQUAL',
        e.participants.map((userId) => ({ userId })),
      );
      if (!split.ok) throw new Error(split.error);
      return { paidById: ids[e.payer]!, amount: e.amount, shares: split.shares };
    });
    return computeNetBalances(ids, expenses);
  });

describe('simplifyDebts properties', () => {
  it('conserves money: applying the transfers settles every balance exactly', () => {
    fc.assert(
      fc.property(groupArb, (balances) => {
        expect(balances.reduce((s, b) => s + b.net, 0)).toBe(0);
        const transfers = simplifyDebts(balances);
        const after = new Map(balances.map((b) => [b.userId, b.net]));
        for (const t of transfers) {
          after.set(t.fromUserId, after.get(t.fromUserId)! + t.amount);
          after.set(t.toUserId, after.get(t.toUserId)! - t.amount);
        }
        for (const value of after.values()) expect(value).toBe(0);
      }),
      { numRuns: 300 },
    );
  });

  it('uses at most (non-zero members − 1) positive integer transfers', () => {
    fc.assert(
      fc.property(groupArb, (balances) => {
        const transfers = simplifyDebts(balances);
        const nonZero = balances.filter((b) => b.net !== 0).length;
        expect(transfers.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));
        for (const t of transfers) {
          expect(Number.isInteger(t.amount)).toBe(true);
          expect(t.amount).toBeGreaterThan(0);
          expect(t.fromUserId).not.toBe(t.toUserId);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('only debtors pay and only creditors receive, never more than they owe/are owed', () => {
    fc.assert(
      fc.property(groupArb, (balances) => {
        const net = new Map(balances.map((b) => [b.userId, b.net]));
        const paid = new Map<string, number>();
        const received = new Map<string, number>();
        for (const t of simplifyDebts(balances)) {
          expect(net.get(t.fromUserId)!).toBeLessThan(0);
          expect(net.get(t.toUserId)!).toBeGreaterThan(0);
          paid.set(t.fromUserId, (paid.get(t.fromUserId) ?? 0) + t.amount);
          received.set(t.toUserId, (received.get(t.toUserId) ?? 0) + t.amount);
        }
        for (const [id, value] of paid) expect(value).toBe(-net.get(id)!);
        for (const [id, value] of received) expect(value).toBe(net.get(id)!);
      }),
      { numRuns: 300 },
    );
  });
});
