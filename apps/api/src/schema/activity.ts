import { pipe, filter } from 'graphql-yoga';

import { simplifyDebts } from '@splitease/shared';

import { builder } from '../builder.js';
import { UserRef } from './user.js';
import { notFound } from '../errors.js';
import type { ActivityEvent } from '../pubsub.js';
import { assertMember } from '../services/groups.js';
import { ActivityTypeEnum } from './enums.js';

builder.prismaObject('Activity', {
  fields: (t) => ({
    id: t.exposeID('id'),
    type: t.expose('type', { type: ActivityTypeEnum }),
    summary: t.exposeString('summary', { description: 'Expense description, member name, or "A paid B".' }),
    amount: t.field({ type: 'SafeInt', nullable: true, resolve: (a) => a.amount }),
    currency: t.exposeString('currency', { nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    expenseId: t.exposeID('expenseId', { nullable: true }),
    actor: t.relation('actor'),
    group: t.relation('group'),
  }),
});

/* ------------------------------------------------------------- dashboard */

interface CurrencyTotalShape {
  currency: string;
  owed: number;
  owes: number;
}

const CurrencyTotal = builder.objectRef<CurrencyTotalShape>('CurrencyTotal').implement({
  description: 'Overall position for one currency across all groups.',
  fields: (t) => ({
    currency: t.exposeString('currency'),
    owed: t.field({ type: 'SafeInt', description: 'Total others owe you', resolve: (c) => c.owed }),
    owes: t.field({ type: 'SafeInt', description: 'Total you owe others', resolve: (c) => c.owes }),
    net: t.field({ type: 'SafeInt', resolve: (c) => c.owed - c.owes }),
  }),
});

interface FriendBalanceShape {
  userId: string;
  currency: string;
  /** Positive: they owe the viewer. Negative: the viewer owes them. */
  amount: number;
}

const FriendBalance = builder.objectRef<FriendBalanceShape>('FriendBalance').implement({
  description: 'Net amount between the viewer and one person, summed over the simplified debts of every shared group.',
  fields: (t) => ({
    currency: t.exposeString('currency'),
    amount: t.field({ type: 'SafeInt', resolve: (f) => f.amount }),
    user: t.field({
      type: UserRef,
      resolve: async (f, _args, ctx) => (await ctx.loaders.user.load(f.userId)) ?? Promise.reject(notFound('User')),
    }),
  }),
});

const Dashboard = builder
  .objectRef<{ totals: CurrencyTotalShape[]; friends: FriendBalanceShape[] }>('Dashboard')
  .implement({
    fields: (t) => ({
      totals: t.field({ type: [CurrencyTotal], resolve: (d) => d.totals }),
      friends: t.field({ type: [FriendBalance], resolve: (d) => d.friends }),
    }),
  });

builder.queryFields((t) => ({
  dashboard: t.field({
    type: Dashboard,
    authScopes: { loggedIn: true },
    description: 'Overall "you owe / you are owed" across all groups, per currency.',
    resolve: async (_root, _args, ctx) => {
      const userId = ctx.userId!;
      const groups = await ctx.prisma.group.findMany({
        where: { members: { some: { userId } } },
        select: { id: true, currency: true },
      });
      const balances = await ctx.loaders.balances.loadMany(groups.map((g) => g.id));

      const totals = new Map<string, CurrencyTotalShape>();
      const friends = new Map<string, FriendBalanceShape>();
      groups.forEach((group, i) => {
        const result = balances[i];
        if (!result || result instanceof Error) return;
        const total = totals.get(group.currency) ?? { currency: group.currency, owed: 0, owes: 0 };
        for (const debt of simplifyDebts(result)) {
          const involved =
            debt.fromUserId === userId ? debt.toUserId : debt.toUserId === userId ? debt.fromUserId : null;
          if (!involved) continue;
          const signed = debt.toUserId === userId ? debt.amount : -debt.amount;
          if (signed > 0) total.owed += signed;
          else total.owes -= signed;
          const key = `${involved}:${group.currency}`;
          const friend = friends.get(key) ?? { userId: involved, currency: group.currency, amount: 0 };
          friend.amount += signed;
          friends.set(key, friend);
        }
        totals.set(group.currency, total);
      });

      return {
        totals: [...totals.values()].sort((a, b) => b.owed + b.owes - (a.owed + a.owes)),
        friends: [...friends.values()]
          .filter((f) => f.amount !== 0)
          .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
      };
    },
  }),

  activity: t.prismaConnection({
    type: 'Activity',
    cursor: 'id',
    defaultSize: 20,
    maxSize: 50,
    authScopes: { loggedIn: true },
    description: "Activity across all of the viewer's groups, newest first.",
    resolve: (query, _root, _args, ctx) =>
      ctx.prisma.activity.findMany({
        ...query,
        where: { group: { members: { some: { userId: ctx.userId! } } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
  }),
}));

/* ---------------------------------------------------------- subscription */

builder.subscriptionField('activityAdded', (t) =>
  t.prismaField({
    type: 'Activity',
    authScopes: { loggedIn: true },
    description:
      "Fires when something happens in one group (groupId) or in any of the viewer's groups. Delivered over SSE.",
    args: { groupId: t.arg.id({ required: false }) },
    subscribe: async (_root, args, ctx) => {
      const userId = ctx.userId!;
      const groupId = args.groupId ? String(args.groupId) : null;
      if (groupId) await assertMember(ctx, groupId);
      return pipe(
        ctx.pubSub.subscribe('activity'),
        filter((event: ActivityEvent) => (groupId ? event.groupId === groupId : event.memberIds.includes(userId))),
      );
    },
    resolve: (query, event: ActivityEvent, _args, ctx) =>
      ctx.prisma.activity.findUniqueOrThrow({ ...query, where: { id: event.activityId } }),
  }),
);
