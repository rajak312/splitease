import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { computeNetBalances } from '@splitease/shared';

import {
  ADD_EXPENSE,
  BALANCES,
  createGroup,
  disconnectPrisma,
  errorCode,
  gql,
  joinGroup,
  prisma,
  resetDatabase,
  signUp,
  type TestUser,
} from './helpers.js';

let a: TestUser;
let b: TestUser;
let c: TestUser;
let groupId: string;

const today = () => new Date().toISOString();
const netOf = (balances: { net: number; user: { id: string } }[], id: string) =>
  balances.find((x) => x.user.id === id)?.net;

async function addExpense(by: TestUser, input: Record<string, unknown>) {
  return gql(ADD_EXPENSE, { groupId, input: { date: today(), category: 'FOOD', ...input } }, by.accessToken);
}

async function balances(as: TestUser = a) {
  const result = await gql(BALANCES, { id: groupId }, as.accessToken);
  if (!result.data) throw new Error(JSON.stringify(result.errors));
  return result.data.group;
}

beforeAll(async () => {
  await resetDatabase();
  a = await signUp('Alice');
  b = await signUp('Bob');
  c = await signUp('Carol');
  const group = await createGroup(a, 'Flat');
  groupId = group.id;
  await joinGroup(b, group.inviteCode);
  await joinGroup(c, group.inviteCode);
});
afterAll(disconnectPrisma);

describe('expenses & balances', () => {
  it('equal split: remainder paisa distributed deterministically, balances computed', async () => {
    const result = await addExpense(a, {
      description: 'Pizza',
      amount: 1000, // ₹10.00 / 3
      paidById: a.id,
      splitMode: 'EQUAL',
      participants: [{ userId: a.id }, { userId: b.id }, { userId: c.id }],
    });
    expect(result.errors).toBeUndefined();
    const amounts = result.data?.createExpense.shares.map((s: { amount: number }) => s.amount);
    expect(amounts.reduce((x: number, y: number) => x + y, 0)).toBe(1000);
    expect([...amounts].sort()).toEqual([333, 333, 334]);
    expect(result.data?.createExpense.myShare).toBeGreaterThanOrEqual(333);

    const g = await balances();
    expect(g.balances.reduce((s: number, x: { net: number }) => s + x.net, 0)).toBe(0);
    expect(netOf(g.balances, a.id)).toBe(1000 - result.data?.createExpense.myShare);
  });

  it('percentage split with basis points', async () => {
    const result = await addExpense(b, {
      description: 'Groceries',
      amount: 20000,
      paidById: b.id,
      splitMode: 'PERCENT',
      participants: [
        { userId: a.id, value: 5000 },
        { userId: b.id, value: 2500 },
        { userId: c.id, value: 2500 },
      ],
    });
    expect(result.errors).toBeUndefined();
    const byUser = Object.fromEntries(
      result.data?.createExpense.shares.map((s: { user: { id: string }; amount: number }) => [s.user.id, s.amount]),
    );
    expect(byUser).toEqual({ [a.id]: 10000, [b.id]: 5000, [c.id]: 5000 });
  });

  it('shares and exact splits, persisting the raw value for editing', async () => {
    const shares = await addExpense(c, {
      description: 'Cab',
      amount: 900,
      paidById: c.id,
      splitMode: 'SHARES',
      participants: [
        { userId: a.id, value: 1 },
        { userId: c.id, value: 2 },
      ],
    });
    expect(shares.data?.createExpense.shares).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ amount: 600, value: 2 }),
        expect.objectContaining({ amount: 300, value: 1 }),
      ]),
    );

    const exact = await addExpense(a, {
      description: 'Tickets',
      amount: 1500,
      paidById: a.id,
      splitMode: 'EXACT',
      participants: [
        { userId: b.id, value: 1000 },
        { userId: c.id, value: 500 },
      ],
    });
    expect(exact.errors).toBeUndefined();
  });

  it('rejects splits that do not add up, float amounts and zero amounts', async () => {
    const bad = await addExpense(a, {
      description: 'Bad exact',
      amount: 1500,
      paidById: a.id,
      splitMode: 'EXACT',
      participants: [
        { userId: b.id, value: 1000 },
        { userId: c.id, value: 400 },
      ],
    });
    expect(errorCode(bad)).toBe('BAD_USER_INPUT');
    expect(bad.errors?.[0]?.extensions?.fields).toHaveProperty('participants');

    const badPercent = await addExpense(a, {
      description: 'Bad percent',
      amount: 1500,
      paidById: a.id,
      splitMode: 'PERCENT',
      participants: [
        { userId: b.id, value: 5000 },
        { userId: c.id, value: 4000 },
      ],
    });
    expect(errorCode(badPercent)).toBe('BAD_USER_INPUT');

    const float = await addExpense(a, {
      description: 'Float',
      amount: 10.5,
      paidById: a.id,
      splitMode: 'EQUAL',
      participants: [{ userId: a.id }],
    });
    expect(float.errors).toBeDefined();

    const zero = await addExpense(a, {
      description: 'Zero',
      amount: 0,
      paidById: a.id,
      splitMode: 'EQUAL',
      participants: [{ userId: a.id }],
    });
    expect(errorCode(zero)).toBe('BAD_USER_INPUT');
  });

  it('server balances match the pure shared computation over raw rows', async () => {
    const expenses = await prisma.expense.findMany({ where: { groupId }, include: { shares: true } });
    const settlements = await prisma.settlement.findMany({ where: { groupId } });
    const expected = computeNetBalances([a.id, b.id, c.id], expenses, settlements);
    const g = await balances(b);
    for (const row of expected) expect(netOf(g.balances, row.userId)).toBe(row.net);
    expect(g.totalSpent).toBe(expenses.reduce((s, e) => s + e.amount, 0));
    expect(g.expenseCount).toBe(expenses.length);
  });

  it('simplified debts settle everyone, and settling up zeroes balances', async () => {
    const before = await balances();
    expect(before.simplifiedDebts.length).toBeGreaterThan(0);
    expect(before.simplifiedDebts.length).toBeLessThanOrEqual(2);

    for (const debt of before.simplifiedDebts) {
      const payer = [a, b, c].find((u) => u.id === debt.from.id)!;
      const result = await gql(
        `mutation($g: ID!, $i: SettlementInput!) { settleUp(groupId: $g, input: $i) { id amount from { id } to { id } } }`,
        { g: groupId, i: { fromUserId: debt.from.id, toUserId: debt.to.id, amount: debt.amount, note: 'UPI' } },
        payer.accessToken,
      );
      expect(result.errors).toBeUndefined();
    }

    const after = await balances();
    expect(after.balances.every((x: { net: number }) => x.net === 0)).toBe(true);
    expect(after.simplifiedDebts).toEqual([]);
    expect(after.myBalance).toBe(0);
  });

  it('rejects settling with yourself', async () => {
    const result = await gql(
      `mutation($g: ID!, $i: SettlementInput!) { settleUp(groupId: $g, input: $i) { id } }`,
      { g: groupId, i: { fromUserId: a.id, toUserId: a.id, amount: 100 } },
      a.accessToken,
    );
    expect(errorCode(result)).toBe('BAD_USER_INPUT');
  });

  it('updates and deletes an expense, recording activity', async () => {
    const created = await addExpense(a, {
      description: 'Movie',
      amount: 900,
      paidById: a.id,
      splitMode: 'EQUAL',
      participants: [{ userId: a.id }, { userId: b.id }, { userId: c.id }],
    });
    const id = created.data?.createExpense.id;
    const updated = await gql(
      `mutation($id: ID!, $input: ExpenseInput!) { updateExpense(id: $id, input: $input) { description amount category splitMode shares { amount } } }`,
      {
        id,
        input: {
          description: 'Movie + popcorn',
          amount: 1200,
          paidById: b.id,
          category: 'ENTERTAINMENT',
          date: today(),
          splitMode: 'EQUAL',
          participants: [{ userId: a.id }, { userId: b.id }],
        },
      },
      c.accessToken,
    );
    expect(updated.data?.updateExpense).toMatchObject({
      description: 'Movie + popcorn',
      amount: 1200,
      category: 'ENTERTAINMENT',
      shares: [{ amount: 600 }, { amount: 600 }],
    });

    const deleted = await gql(`mutation($id: ID!) { deleteExpense(id: $id) }`, { id }, b.accessToken);
    expect(deleted.data?.deleteExpense).toBe(id);
    expect(await prisma.expense.findUnique({ where: { id } })).toBeNull();
    expect(await prisma.expenseShare.count({ where: { expenseId: id } })).toBe(0);

    const activity = await gql(
      `query($id: ID!) { group(id: $id) { activity(first: 3) { type summary actor { id } } } }`,
      { id: groupId },
      a.accessToken,
    );
    expect(activity.data?.group.activity.map((x: { type: string }) => x.type)).toEqual([
      'EXPENSE_DELETED',
      'EXPENSE_UPDATED',
      'EXPENSE_ADDED',
    ]);
  });

  it('paginates and filters expenses by search text and category', async () => {
    const page = await gql(
      `query($id: ID!) { group(id: $id) { expenses(first: 2) { totalCount pageInfo { hasNextPage endCursor } edges { node { description } } } } }`,
      { id: groupId },
      a.accessToken,
    );
    const conn = page.data?.group.expenses;
    expect(conn.totalCount).toBe(4);
    expect(conn.edges).toHaveLength(2);
    expect(conn.pageInfo.hasNextPage).toBe(true);

    const next = await gql(
      `query($id: ID!, $after: String) { group(id: $id) { expenses(first: 10, after: $after) { edges { node { description } } } } }`,
      { id: groupId, after: conn.pageInfo.endCursor },
      a.accessToken,
    );
    expect(next.data?.group.expenses.edges).toHaveLength(2);

    const search = await gql(
      `query($id: ID!) { group(id: $id) { expenses(search: "pIzZ") { totalCount edges { node { description } } } } }`,
      { id: groupId },
      a.accessToken,
    );
    expect(search.data?.group.expenses.edges.map((e: { node: { description: string } }) => e.node.description)).toEqual(
      ['Pizza'],
    );

    const byCategory = await gql(
      `query($id: ID!) { group(id: $id) { categoryBreakdown { category amount count } } }`,
      { id: groupId },
      a.accessToken,
    );
    expect(byCategory.data?.group.categoryBreakdown).toEqual([
      { category: 'FOOD', amount: 1000 + 20000 + 900 + 1500, count: 4 },
    ]);
  });

  it('dashboard summarises owed / owes per currency', async () => {
    await addExpense(a, {
      description: 'Dinner',
      amount: 3000,
      paidById: a.id,
      splitMode: 'EQUAL',
      participants: [{ userId: a.id }, { userId: b.id }, { userId: c.id }],
    });
    const dash = await gql(
      `{ dashboard { totals { currency owed owes net } friends { amount user { id } } } }`,
      {},
      a.accessToken,
    );
    expect(dash.data?.dashboard.totals).toEqual([{ currency: 'INR', owed: 2000, owes: 0, net: 2000 }]);
    expect(dash.data?.dashboard.friends).toHaveLength(2);

    const dashB = await gql(`{ dashboard { totals { owes } } }`, {}, b.accessToken);
    expect(dashB.data?.dashboard.totals[0].owes).toBe(1000);
  });
});
