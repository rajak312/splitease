import DataLoader from 'dataloader';
import type { YogaInitialContext } from 'graphql-yoga';

import type { NetBalance } from '@splitease/shared';

import { verifyAccessToken } from './auth/tokens.js';
import { getPrisma, type PrismaClient } from './db.js';
import { unauthenticated } from './errors.js';
import type { GroupMember, User } from './generated/prisma/client.js';
import { pubSub, type PubSub } from './pubsub.js';

export interface Context {
  prisma: PrismaClient;
  userId: string | null;
  pubSub: PubSub;
  loaders: ReturnType<typeof createLoaders>;
}

/**
 * Request-scoped DataLoaders. They batch per-group lookups that the Prisma
 * plugin can't express as a single include (membership checks and aggregate
 * balances), so a dashboard with N groups costs a constant number of queries.
 */
export function createLoaders(prisma: PrismaClient, userId: string | null) {
  return {
    /** Users by id (for computed types like balances/debts that reference users). */
    user: new DataLoader<string, User | null>(async (ids) => {
      const rows = await prisma.user.findMany({ where: { id: { in: [...ids] } } });
      const byId = new Map(rows.map((r) => [r.id, r]));
      return ids.map((id) => byId.get(id) ?? null);
    }),

    /** Total spent and expense count per group. */
    groupStats: new DataLoader<string, { totalSpent: number; expenseCount: number }>(async (groupIds) => {
      const rows = await prisma.expense.groupBy({
        by: ['groupId'],
        where: { groupId: { in: [...groupIds] } },
        _sum: { amount: true },
        _count: { _all: true },
      });
      const byGroup = new Map(rows.map((r) => [r.groupId, r]));
      return groupIds.map((id) => ({
        totalSpent: byGroup.get(id)?._sum.amount ?? 0,
        expenseCount: byGroup.get(id)?._count._all ?? 0,
      }));
    }),

    /** The viewer's membership row for each group id (or null). */
    membership: new DataLoader<string, GroupMember | null>(async (groupIds) => {
      if (!userId) return groupIds.map(() => null);
      const rows = await prisma.groupMember.findMany({ where: { userId, groupId: { in: [...groupIds] } } });
      const byGroup = new Map(rows.map((r) => [r.groupId, r]));
      return groupIds.map((id) => byGroup.get(id) ?? null);
    }),

    /** Net balance of every member, per group, from 5 aggregate queries total. */
    balances: new DataLoader<string, NetBalance[]>(async (groupIds) => {
      const ids = [...groupIds];
      const [members, paid, owed, sent, received] = await Promise.all([
        prisma.groupMember.findMany({ where: { groupId: { in: ids } }, select: { groupId: true, userId: true } }),
        prisma.expense.groupBy({
          by: ['groupId', 'paidById'],
          where: { groupId: { in: ids } },
          _sum: { amount: true },
        }),
        prisma.$queryRaw<{ groupId: string; userId: string; amount: bigint }[]>`
          SELECT e."groupId", s."userId", SUM(s.amount)::bigint AS amount
          FROM "ExpenseShare" s JOIN "Expense" e ON e.id = s."expenseId"
          WHERE e."groupId" = ANY(${ids})
          GROUP BY e."groupId", s."userId"`,
        prisma.settlement.groupBy({
          by: ['groupId', 'fromUserId'],
          where: { groupId: { in: ids } },
          _sum: { amount: true },
        }),
        prisma.settlement.groupBy({
          by: ['groupId', 'toUserId'],
          where: { groupId: { in: ids } },
          _sum: { amount: true },
        }),
      ]);

      const net = new Map(ids.map((id) => [id, new Map<string, number>()]));
      const add = (groupId: string, userId: string, delta: number) => {
        const group = net.get(groupId);
        if (group) group.set(userId, (group.get(userId) ?? 0) + delta);
      };
      for (const m of members) add(m.groupId, m.userId, 0);
      for (const p of paid) add(p.groupId, p.paidById, p._sum.amount ?? 0);
      for (const o of owed) add(o.groupId, o.userId, -Number(o.amount));
      for (const s of sent) add(s.groupId, s.fromUserId, s._sum.amount ?? 0);
      for (const r of received) add(r.groupId, r.toUserId, -(r._sum.amount ?? 0));

      return ids.map((groupId) =>
        [...(net.get(groupId) ?? new Map<string, number>()).entries()]
          .map(([userId, value]) => ({ userId, net: value }))
          .sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0)),
      );
    }),
  };
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || null;
  return null;
}

export async function createContext(initial: YogaInitialContext): Promise<Context> {
  const prisma = getPrisma();
  let token = bearerToken(initial.request);
  // EventSource/SSE clients cannot always set headers; allow the token via
  // connection params (graphql-sse / urql pass them in the extensions).
  if (!token) {
    const ext = initial.params?.extensions as { authorization?: string } | undefined;
    if (ext?.authorization?.startsWith('Bearer ')) token = ext.authorization.slice(7);
  }
  const claims = token ? await verifyAccessToken(token) : null;
  const userId = claims?.userId ?? null;
  return { prisma, userId, pubSub, loaders: createLoaders(prisma, userId) };
}

export function requireUser(ctx: Context): string {
  if (!ctx.userId) throw unauthenticated();
  return ctx.userId;
}
