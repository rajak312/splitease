import { sum } from './money';

export interface ExpenseLike {
  paidById: string;
  amount: number;
  shares: readonly { userId: string; amount: number }[];
}

export interface SettlementLike {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

export interface NetBalance {
  userId: string;
  /** Positive: the group owes this person. Negative: this person owes the group. */
  net: number;
}

export interface Transfer {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Net position of every member: what they paid minus what they consumed,
 * adjusted by settlements (paying someone back raises your balance and
 * lowers theirs). The values always sum to zero.
 */
export function computeNetBalances(
  memberIds: readonly string[],
  expenses: readonly ExpenseLike[],
  settlements: readonly SettlementLike[] = [],
): NetBalance[] {
  const net = new Map<string, number>(memberIds.map((id) => [id, 0]));
  const add = (id: string, delta: number) => net.set(id, (net.get(id) ?? 0) + delta);

  for (const e of expenses) {
    add(e.paidById, e.amount);
    for (const s of e.shares) add(s.userId, -s.amount);
  }
  for (const s of settlements) {
    add(s.fromUserId, s.amount);
    add(s.toUserId, -s.amount);
  }

  return [...net.entries()]
    .map(([userId, value]) => ({ userId, net: value }))
    .sort((a, b) => compareIds(a.userId, b.userId));
}

/**
 * Debt simplification: given net balances, produce a small set of transfers
 * that settles everyone.
 *
 * Greedy algorithm — repeatedly match the person who owes the most with the
 * person who is owed the most and transfer the smaller of the two amounts.
 * Each step settles at least one person completely, so for `n` people with a
 * non-zero balance it emits at most `n - 1` transfers (finding the true
 * minimum is NP-hard — it reduces to subset-sum — but greedy is optimal or
 * near-optimal for real groups and is what Splitwise-style apps use).
 * Ties are broken by userId so the output is fully deterministic.
 */
export function simplifyDebts(balances: readonly NetBalance[]): Transfer[] {
  const total = sum(balances.map((b) => b.net));
  if (total !== 0) {
    throw new RangeError(`Balances must sum to zero (got ${total})`);
  }

  const creditors = balances.filter((b) => b.net > 0).map((b) => ({ ...b }));
  const debtors = balances.filter((b) => b.net < 0).map((b) => ({ userId: b.userId, net: -b.net }));
  const byLargest = (a: NetBalance, b: NetBalance) => b.net - a.net || compareIds(a.userId, b.userId);

  const transfers: Transfer[] = [];
  creditors.sort(byLargest);
  debtors.sort(byLargest);

  while (creditors.length > 0 && debtors.length > 0) {
    const creditor = creditors[0]!;
    const debtor = debtors[0]!;
    const amount = Math.min(creditor.net, debtor.net);

    transfers.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amount });
    creditor.net -= amount;
    debtor.net -= amount;

    if (creditor.net === 0) creditors.shift();
    if (debtor.net === 0) debtors.shift();
    // Keep both queues ordered by remaining magnitude.
    creditors.sort(byLargest);
    debtors.sort(byLargest);
  }

  return transfers;
}

/** Pairwise view used for "you owe X / X owes you" from one member's perspective. */
export function transfersFor(userId: string, transfers: readonly Transfer[]) {
  const owes = transfers.filter((t) => t.fromUserId === userId);
  const owed = transfers.filter((t) => t.toUserId === userId);
  return {
    owes,
    owed,
    totalOwes: sum(owes.map((t) => t.amount)),
    totalOwed: sum(owed.map((t) => t.amount)),
  };
}
