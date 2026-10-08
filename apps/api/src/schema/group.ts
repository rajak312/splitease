import { groupSchema, inviteCodeSchema, simplifyDebts, type Transfer } from '@splitease/shared';

import { builder } from '../builder.js';
import { UserRef } from './user.js';
import { getEnv } from '../env.js';
import { appError, forbidden, notFound, parseInput } from '../errors.js';
import { type Prisma } from '../generated/prisma/client.js';
import { assertMember, generateInviteCode, recordActivity } from '../services/groups.js';
import { CategoryEnum, GroupRoleEnum } from './enums.js';

/* ------------------------------------------------------------------ types */

interface MemberBalanceShape {
  userId: string;
  net: number;
}

const MemberBalance = builder.objectRef<MemberBalanceShape>('MemberBalance').implement({
  description: "A member's net position in a group. Positive: they are owed money. Negative: they owe.",
  fields: (t) => ({
    net: t.field({ type: 'SafeInt', resolve: (b) => b.net }),
    user: t.field({
      type: UserRef,
      resolve: async (b, _args, ctx) => {
        const user = await ctx.loaders.user.load(b.userId);
        if (!user) throw notFound('User');
        return user;
      },
    }),
  }),
});

const Debt = builder.objectRef<Transfer>('Debt').implement({
  description: 'One transfer in the simplified settlement plan: `from` pays `to` `amount`.',
  fields: (t) => ({
    amount: t.field({ type: 'SafeInt', resolve: (d) => d.amount }),
    from: t.field({
      type: UserRef,
      resolve: async (d, _args, ctx) => (await ctx.loaders.user.load(d.fromUserId)) ?? Promise.reject(notFound('User')),
    }),
    to: t.field({
      type: UserRef,
      resolve: async (d, _args, ctx) => (await ctx.loaders.user.load(d.toUserId)) ?? Promise.reject(notFound('User')),
    }),
  }),
});

interface CategoryTotalShape {
  category: Prisma.ExpenseGroupByOutputType['category'];
  amount: number;
  count: number;
}

const CategoryTotal = builder.objectRef<CategoryTotalShape>('CategoryTotal').implement({
  fields: (t) => ({
    category: t.field({ type: CategoryEnum, resolve: (c) => c.category }),
    amount: t.field({ type: 'SafeInt', resolve: (c) => c.amount }),
    count: t.exposeInt('count'),
  }),
});

builder.prismaObject('GroupMember', {
  fields: (t) => ({
    id: t.exposeID('id'),
    role: t.expose('role', { type: GroupRoleEnum }),
    joinedAt: t.expose('joinedAt', { type: 'DateTime' }),
    user: t.relation('user'),
  }),
});

builder.prismaObject('Group', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    emoji: t.exposeString('emoji'),
    currency: t.exposeString('currency', { description: 'ISO-4217 code; all amounts in this group use it.' }),
    inviteCode: t.exposeString('inviteCode'),
    inviteUrl: t.string({
      description: 'Shareable web link. The app also handles splitease://join/<code>.',
      resolve: (g) => `${getEnv().WEB_APP_URL}/join/${g.inviteCode}`,
    }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    members: t.relation('members', { query: { orderBy: { joinedAt: 'asc' } } }),
    memberCount: t.relationCount('members'),
    viewerRole: t.field({
      type: GroupRoleEnum,
      resolve: async (g, _args, ctx) => (await assertMember(ctx, g.id)).role,
    }),

    expenses: t.relatedConnection(
      'expenses',
      {
        cursor: 'id',
        defaultSize: 25,
        maxSize: 100,
        totalCount: true,
        args: {
          search: t.arg.string({ required: false, description: 'Case-insensitive match on description or notes' }),
          category: t.arg({ type: CategoryEnum, required: false }),
        },
        query: (args) => {
          const where: Prisma.ExpenseWhereInput = {};
          const search = args.search?.trim();
          if (search) {
            where.OR = [
              { description: { contains: search, mode: 'insensitive' } },
              { notes: { contains: search, mode: 'insensitive' } },
            ];
          }
          if (args.category) where.category = args.category;
          return { where, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] };
        },
      },
      { name: 'GroupExpensesConnection' },
      { name: 'GroupExpensesEdge' },
    ),

    settlements: t.relation('settlements', {
      args: { first: t.arg.int({ required: false }) },
      query: (args) => ({ orderBy: { date: 'desc' }, take: Math.min(args.first ?? 50, 100) }),
    }),

    activity: t.relation('activities', {
      args: { first: t.arg.int({ required: false }) },
      query: (args) => ({ orderBy: { createdAt: 'desc' }, take: Math.min(args.first ?? 20, 100) }),
    }),

    balances: t.field({
      type: [MemberBalance],
      description: 'Net balance of every member (sums to zero).',
      resolve: (g, _args, ctx) => ctx.loaders.balances.load(g.id),
    }),
    simplifiedDebts: t.field({
      type: [Debt],
      description: 'Minimal-ish set of transfers that settles the whole group (greedy debt simplification).',
      resolve: async (g, _args, ctx) => simplifyDebts(await ctx.loaders.balances.load(g.id)),
    }),
    myBalance: t.field({
      type: 'SafeInt',
      description: "The viewer's net balance in this group.",
      resolve: async (g, _args, ctx) =>
        (await ctx.loaders.balances.load(g.id)).find((b) => b.userId === ctx.userId)?.net ?? 0,
    }),
    totalSpent: t.field({
      type: 'SafeInt',
      resolve: async (g, _args, ctx) => (await ctx.loaders.groupStats.load(g.id)).totalSpent,
    }),
    expenseCount: t.int({
      resolve: async (g, _args, ctx) => (await ctx.loaders.groupStats.load(g.id)).expenseCount,
    }),
    categoryBreakdown: t.field({
      type: [CategoryTotal],
      description: 'Spending per category, largest first.',
      resolve: async (g, _args, ctx) => {
        const rows = await ctx.prisma.expense.groupBy({
          by: ['category'],
          where: { groupId: g.id },
          _sum: { amount: true },
          _count: { _all: true },
        });
        return rows
          .map((r) => ({ category: r.category, amount: r._sum.amount ?? 0, count: r._count._all }))
          .sort((a, b) => b.amount - a.amount);
      },
    }),
  }),
});

const InvitePreview = builder
  .objectRef<{
    code: string;
    name: string;
    emoji: string;
    currency: string;
    memberCount: number;
    alreadyMember: boolean;
    groupId: string;
  }>('InvitePreview')
  .implement({
    fields: (t) => ({
      code: t.exposeString('code'),
      groupId: t.exposeID('groupId'),
      name: t.exposeString('name'),
      emoji: t.exposeString('emoji'),
      currency: t.exposeString('currency'),
      memberCount: t.exposeInt('memberCount'),
      alreadyMember: t.exposeBoolean('alreadyMember'),
    }),
  });

/* ---------------------------------------------------------------- queries */

builder.queryFields((t) => ({
  groups: t.prismaField({
    type: ['Group'],
    authScopes: { loggedIn: true },
    description: 'Groups the viewer belongs to, most recently active first.',
    resolve: (query, _root, _args, ctx) =>
      ctx.prisma.group.findMany({
        ...query,
        where: { members: { some: { userId: ctx.userId! } } },
        orderBy: { updatedAt: 'desc' },
      }),
  }),

  group: t.prismaField({
    type: 'Group',
    authScopes: { loggedIn: true },
    args: { id: t.arg.id({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await assertMember(ctx, String(args.id));
      const group = await ctx.prisma.group.findUnique({ ...query, where: { id: String(args.id) } });
      if (!group) throw notFound('Group');
      return group;
    },
  }),

  invitePreview: t.field({
    type: InvitePreview,
    authScopes: { loggedIn: true },
    args: { code: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const code = parseInput(inviteCodeSchema, args.code);
      const group = await ctx.prisma.group.findUnique({
        where: { inviteCode: code },
        include: { _count: { select: { members: true } }, members: { where: { userId: ctx.userId! } } },
      });
      if (!group) throw notFound('Invite');
      return {
        code,
        groupId: group.id,
        name: group.name,
        emoji: group.emoji,
        currency: group.currency,
        memberCount: group._count.members,
        alreadyMember: group.members.length > 0,
      };
    },
  }),
}));

/* -------------------------------------------------------------- mutations */

const GroupInput = builder.inputType('GroupInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    emoji: t.string({ required: false }),
    currency: t.string({ required: false, description: 'ISO-4217 code, defaults to INR' }),
  }),
});

async function createUniqueInviteCode(prisma: Prisma.TransactionClient) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateInviteCode();
    if (!(await prisma.group.findUnique({ where: { inviteCode: code }, select: { id: true } }))) return code;
  }
  throw new Error('Could not allocate an invite code');
}

builder.mutationFields((t) => ({
  createGroup: t.prismaField({
    type: 'Group',
    authScopes: { loggedIn: true },
    args: { input: t.arg({ type: GroupInput, required: true }) },
    resolve: async (query, _root, args, ctx) => {
      const input = parseInput(groupSchema, {
        name: args.input.name,
        emoji: args.input.emoji ?? undefined,
        currency: args.input.currency ?? undefined,
      });
      const userId = ctx.userId!;
      const { group, event } = await ctx.prisma.$transaction(async (tx) => {
        const created = await tx.group.create({
          data: {
            ...input,
            inviteCode: await createUniqueInviteCode(tx),
            createdById: userId,
            members: { create: { userId, role: 'OWNER' } },
          },
        });
        const evt = await recordActivity(tx, {
          groupId: created.id,
          actorId: userId,
          type: 'GROUP_CREATED',
          summary: created.name,
        });
        return { group: created, event: evt };
      });
      ctx.pubSub.publish('activity', event);
      return ctx.prisma.group.findUniqueOrThrow({ ...query, where: { id: group.id } });
    },
  }),

  updateGroup: t.prismaField({
    type: 'Group',
    authScopes: { loggedIn: true },
    args: { id: t.arg.id({ required: true }), input: t.arg({ type: GroupInput, required: true }) },
    resolve: async (query, _root, args, ctx) => {
      const id = String(args.id);
      await assertMember(ctx, id);
      const input = parseInput(groupSchema, {
        name: args.input.name,
        emoji: args.input.emoji ?? undefined,
        currency: args.input.currency ?? undefined,
      });
      const existing = await ctx.prisma.group.findUniqueOrThrow({
        where: { id },
        include: { _count: { select: { expenses: true, settlements: true } } },
      });
      if (input.currency !== existing.currency && existing._count.expenses + existing._count.settlements > 0) {
        throw appError('BAD_USER_INPUT', 'Currency can only be changed before any expenses are added', {
          fields: { currency: 'Currency is locked once the group has expenses' },
        });
      }
      return ctx.prisma.group.update({ ...query, where: { id }, data: input });
    },
  }),

  joinGroup: t.prismaField({
    type: 'Group',
    authScopes: { loggedIn: true },
    args: { code: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      const code = parseInput(inviteCodeSchema, args.code);
      const userId = ctx.userId!;
      const group = await ctx.prisma.group.findUnique({ where: { inviteCode: code } });
      if (!group) throw notFound('Invite');

      const event = await ctx.prisma.$transaction(async (tx) => {
        const existing = await tx.groupMember.findUnique({
          where: { groupId_userId: { groupId: group.id, userId } },
        });
        if (existing) return null;
        await tx.groupMember.create({ data: { groupId: group.id, userId } });
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
        return recordActivity(tx, { groupId: group.id, actorId: userId, type: 'MEMBER_JOINED', summary: user.name });
      });
      if (event) ctx.pubSub.publish('activity', event);
      ctx.loaders.membership.clear(group.id);
      return ctx.prisma.group.findUniqueOrThrow({ ...query, where: { id: group.id } });
    },
  }),

  regenerateInviteCode: t.prismaField({
    type: 'Group',
    authScopes: { loggedIn: true },
    description: 'Invalidate the current invite link (owner only).',
    args: { groupId: t.arg.id({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      const id = String(args.groupId);
      const membership = await assertMember(ctx, id);
      if (membership.role !== 'OWNER') throw forbidden('Only the group owner can reset the invite link');
      return ctx.prisma.group.update({
        ...query,
        where: { id },
        data: { inviteCode: await createUniqueInviteCode(ctx.prisma) },
      });
    },
  }),
}));
