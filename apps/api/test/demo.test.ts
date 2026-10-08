import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { computeNetBalances, simplifyDebts } from '@splitease/shared';

import { cleanupDemoSandboxes } from '../src/services/demo.js';
import { disconnectPrisma, gql, prisma, resetDatabase } from './helpers.js';

beforeAll(resetDatabase);
afterAll(disconnectPrisma);

describe('demo sandbox', () => {
  it('loginDemo creates a private workspace with realistic data', async () => {
    const result = await gql(`mutation { loginDemo { accessToken user { id name isDemo } } }`);
    const session = result.data?.loginDemo;
    expect(session.user).toMatchObject({ name: 'Aarav Sharma', isDemo: true });

    const groups = await gql(
      `{ groups { id name currency expenseCount simplifiedDebts { amount } balances { net } } }`,
      {},
      session.accessToken,
    );
    const names = groups.data?.groups.map((g: { name: string }) => g.name);
    expect(names).toEqual(expect.arrayContaining(['Goa Trip', 'Flat 402', 'Office lunches', 'Bangkok Weekend']));
    const currencies = new Set(groups.data?.groups.map((g: { currency: string }) => g.currency));
    expect(currencies).toEqual(new Set(['INR', 'THB']));
    for (const g of groups.data?.groups ?? []) {
      expect(g.expenseCount).toBeGreaterThan(3);
      expect(g.balances.reduce((s: number, b: { net: number }) => s + b.net, 0)).toBe(0);
    }
  });

  it('two visitors get isolated sandboxes', async () => {
    const one = (await gql(`mutation { loginDemo { accessToken } }`)).data?.loginDemo.accessToken;
    const two = (await gql(`mutation { loginDemo { accessToken } }`)).data?.loginDemo.accessToken;
    const g1 = (await gql(`{ groups { id } }`, {}, one)).data?.groups.map((g: { id: string }) => g.id);
    const g2 = (await gql(`{ groups { id } }`, {}, two)).data?.groups.map((g: { id: string }) => g.id);
    expect(g1.some((id: string) => g2.includes(id))).toBe(false);
  });

  it('server-side balances and debts match the pure functions for every seeded group', async () => {
    const groups = await prisma.group.findMany({
      include: { members: true, expenses: { include: { shares: true } }, settlements: true },
    });
    for (const g of groups) {
      const expected = computeNetBalances(
        g.members.map((m) => m.userId),
        g.expenses,
        g.settlements,
      );
      expect(expected.reduce((s, b) => s + b.net, 0)).toBe(0);
      expect(() => simplifyDebts(expected)).not.toThrow();
    }
  });

  it('expired sandboxes are cleaned up with all their data', async () => {
    const before = await prisma.group.count();
    await prisma.user.updateMany({
      where: { isDemo: true, demoOwnerId: null },
      data: { createdAt: new Date(Date.now() - 25 * 3600 * 1000) },
    });
    const removed = await cleanupDemoSandboxes(prisma);
    expect(removed).toBe(3);
    expect(await prisma.group.count()).toBe(before - 12);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.expense.count()).toBe(0);
  });
});
