import { computeSplit, expenseSchema, settlementSchema, type ExpenseParsed } from '@splitease/shared';

import { builder } from '../builder.js';
import type { Context } from '../context.js';
import { appError, notFound, parseInput } from '../errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { assertMember, recordActivity } from '../services/groups.js';
import { CategoryEnum, SplitModeEnum } from './enums.js';

/* ------------------------------------------------------------------ types */

builder.prismaObject('ExpenseShare', {
  fields: (t) => ({
    id: t.exposeID('id'),
    amount: t.field({ type: 'SafeInt', resolve: (s) => s.amount }),
    value: t.exposeInt('value', {
      nullable: true,
      description: 'Raw split input: minor units (EXACT), basis points (PERCENT) or weight (SHARES).',
    }),
    user: t.relation('user'),
  }),
});

builder.prismaObject('Expense', {
  fields: (t) => ({
    id: t.exposeID('id'),
    description: t.exposeString('description'),
    amount: t.field({ type: 'SafeInt', resolve: (e) => e.amount }),
    currency: t.exposeString('currency'),
    category: t.expose('category', { type: CategoryEnum }),
    splitMode: t.expose('splitMode', { type: SplitModeEnum }),
    date: t.expose('date', { type: 'DateTime' }),
    notes: t.exposeString('notes', { nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    group: t.relation('group'),
    paidBy: t.relation('paidBy'),
    createdBy: t.relation('createdBy'),
    shares: t.relation('shares', { query: { orderBy: { amount: 'desc' } } }),
    myShare: t.field({
      type: 'SafeInt',
      description: "The viewer's share of this expense (0 if not involved).",
      select: { shares: { select: { userId: true, amount: true } } },
      resolve: (e, _args, ctx) => e.shares.find((s) => s.userId === ctx.userId)?.amount ?? 0,
    }),
  }),
});

builder.prismaObject('Settlement', {
  fields: (t) => ({
    id: t.exposeID('id'),
    amount: t.field({ type: 'SafeInt', resolve: (s) => s.amount }),
    currency: t.exposeString('currency'),
    note: t.exposeString('note', { nullable: true }),
    date: t.expose('date', { type: 'DateTime' }),
    from: t.relation('fromUser'),
    to: t.relation('toUser'),
    createdBy: t.relation('createdBy'),
    group: t.relation('group'),
  }),
});

/* ----------------------------------------------------------------- inputs */

const SplitParticipantInput = builder.inputType('SplitParticipantInput', {
  fields: (t) => ({
    userId: t.id({ required: true }),
    value: t.int({ required: false, description: 'Ignored for EQUAL; see SplitMode for units.' }),
  }),
});

const ExpenseInput = builder.inputType('ExpenseInput', {
  fields: (t) => ({
    description: t.string({ required: true }),
    amount: t.field({ type: 'SafeInt', required: true, description: 'Minor units, e.g. 125050 = ₹1,250.50' }),
    paidById: t.id({ required: true }),
    category: t.field({ type: CategoryEnum, required: false }),
    date: t.field({ type: 'DateTime', required: true }),
    notes: t.string({ required: false }),
    splitMode: t.field({ type: SplitModeEnum, required: true }),
    participants: t.field({ type: [SplitParticipantInput], required: true }),
  }),
});

const SettlementInput = builder.inputType('SettlementInput', {
  fields: (t) => ({
    fromUserId: t.id({ required: true }),
    toUserId: t.id({ required: true }),
    amount: t.field({ type: 'SafeInt', required: true }),
    note: t.string({ required: false }),
  }),
});

/* ---------------------------------------------------------------- helpers */

async function assertAllMembers(ctx: Context, groupId: string, userIds: string[]) {
  const unique = [...new Set(userIds)];
  const count = await ctx.prisma.groupMember.count({ where: { groupId, userId: { in: unique } } });
  if (count !== unique.length) {
    throw appError('BAD_USER_INPUT', 'Everyone in an expense must be a member of the group', {
      fields: { participants: 'Everyone in an expense must be a member of the group' },
    });
  }
}

/** Validate with the shared schema, check membership, and compute share rows server-side. */
async function prepareExpense(ctx: Context, groupId: string, raw: unknown) {
  const input: ExpenseParsed = parseInput(expenseSchema, raw);
  await assertAllMembers(ctx, groupId, [input.paidById, ...input.participants.map((p) => p.userId)]);
  const split = computeSplit(input.amount, input.splitMode, input.participants);
  if (!split.ok) throw appError('BAD_USER_INPUT', split.error, { fields: { participants: split.error } });
  const values = new Map(input.participants.map((p) => [p.userId, p.value ?? null]));
  const shares = split.shares.map((s) => ({
    userId: s.userId,
    amount: s.amount,
    value: input.splitMode === 'EQUAL' ? null : (values.get(s.userId) ?? null),
  }));
  return { input, shares };
}

function toRawInput(input: {
  description: string;
  amount: number;
  paidById: string | number;
  category?: string | null;
  date: Date;
  notes?: string | null;
  splitMode: string;
  participants: { userId: string | number; value?: number | null }[];
}) {
  return {
    ...input,
    paidById: String(input.paidById),
    category: input.category ?? undefined,
    participants: input.participants.map((p) => ({ userId: String(p.userId), value: p.value ?? null })),
  };
}

/* -------------------------------------------------------------- queries */

builder.queryField('expense', (t) =>
  t.prismaField({
    type: 'Expense',
    authScopes: { loggedIn: true },
    args: { id: t.arg.id({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      const expense = await ctx.prisma.expense.findUnique({ ...query, where: { id: String(args.id) } });
      if (!expense) throw notFound('Expense');
      await assertMember(ctx, expense.groupId);
      return expense;
    },
  }),
);

/* ------------------------------------------------------------ mutations */

builder.mutationFields((t) => ({
  createExpense: t.prismaField({
    type: 'Expense',
    authScopes: { loggedIn: true },
    args: {
      groupId: t.arg.id({ required: true }),
      input: t.arg({ type: ExpenseInput, required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      const groupId = String(args.groupId);
      await assertMember(ctx, groupId);
      const { input, shares } = await prepareExpense(ctx, groupId, toRawInput(args.input));
      const userId = ctx.userId!;

      const { expenseId, event } = await ctx.prisma.$transaction(async (tx) => {
        const group = await tx.group.update({ where: { id: groupId }, data: { updatedAt: new Date() } });
        const expense = await tx.expense.create({
          data: {
            groupId,
            description: input.description,
            amount: input.amount,
            currency: group.currency,
            category: input.category,
            splitMode: input.splitMode,
            date: input.date,
            notes: input.notes ?? null,
            paidById: input.paidById,
            createdById: userId,
            shares: { createMany: { data: shares } },
          },
        });
        const evt = await recordActivity(tx, {
          groupId,
          actorId: userId,
          type: 'EXPENSE_ADDED',
          summary: expense.description,
          amount: expense.amount,
          currency: expense.currency,
          expenseId: expense.id,
        });
        return { expenseId: expense.id, event: evt };
      });

      ctx.pubSub.publish('activity', event);
      return ctx.prisma.expense.findUniqueOrThrow({ ...query, where: { id: expenseId } });
    },
  }),

  updateExpense: t.prismaField({
    type: 'Expense',
    authScopes: { loggedIn: true },
    args: {
      id: t.arg.id({ required: true }),
      input: t.arg({ type: ExpenseInput, required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      const id = String(args.id);
      const existing = await ctx.prisma.expense.findUnique({ where: { id } });
      if (!existing) throw notFound('Expense');
      await assertMember(ctx, existing.groupId);
      const { input, shares } = await prepareExpense(ctx, existing.groupId, toRawInput(args.input));
      const userId = ctx.userId!;

      const event = await ctx.prisma.$transaction(async (tx) => {
        await tx.expenseShare.deleteMany({ where: { expenseId: id } });
        const data: Prisma.ExpenseUpdateInput = {
          description: input.description,
          amount: input.amount,
          category: input.category,
          splitMode: input.splitMode,
          date: input.date,
          notes: input.notes ?? null,
          paidBy: { connect: { id: input.paidById } },
          shares: { createMany: { data: shares } },
        };
        const expense = await tx.expense.update({ where: { id }, data });
        await tx.group.update({ where: { id: existing.groupId }, data: { updatedAt: new Date() } });
        return recordActivity(tx, {
          groupId: existing.groupId,
          actorId: userId,
          type: 'EXPENSE_UPDATED',
          summary: expense.description,
          amount: expense.amount,
          currency: expense.currency,
          expenseId: expense.id,
        });
      });

      ctx.pubSub.publish('activity', event);
      return ctx.prisma.expense.findUniqueOrThrow({ ...query, where: { id } });
    },
  }),

  deleteExpense: t.field({
    type: 'ID',
    authScopes: { loggedIn: true },
    description: 'Delete an expense; returns its id.',
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const id = String(args.id);
      const existing = await ctx.prisma.expense.findUnique({ where: { id } });
      if (!existing) throw notFound('Expense');
      await assertMember(ctx, existing.groupId);
      const userId = ctx.userId!;

      const event = await ctx.prisma.$transaction(async (tx) => {
        await tx.expense.delete({ where: { id } });
        await tx.group.update({ where: { id: existing.groupId }, data: { updatedAt: new Date() } });
        return recordActivity(tx, {
          groupId: existing.groupId,
          actorId: userId,
          type: 'EXPENSE_DELETED',
          summary: existing.description,
          amount: existing.amount,
          currency: existing.currency,
        });
      });
      ctx.pubSub.publish('activity', event);
      return id;
    },
  }),

  settleUp: t.prismaField({
    type: 'Settlement',
    authScopes: { loggedIn: true },
    description: 'Record a payment from one member to another.',
    args: {
      groupId: t.arg.id({ required: true }),
      input: t.arg({ type: SettlementInput, required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      const groupId = String(args.groupId);
      await assertMember(ctx, groupId);
      const input = parseInput(settlementSchema, {
        fromUserId: String(args.input.fromUserId),
        toUserId: String(args.input.toUserId),
        amount: args.input.amount,
        note: args.input.note,
      });
      await assertAllMembers(ctx, groupId, [input.fromUserId, input.toUserId]);
      const userId = ctx.userId!;

      const { settlementId, event } = await ctx.prisma.$transaction(async (tx) => {
        const group = await tx.group.update({ where: { id: groupId }, data: { updatedAt: new Date() } });
        const settlement = await tx.settlement.create({
          data: {
            groupId,
            fromUserId: input.fromUserId,
            toUserId: input.toUserId,
            amount: input.amount,
            currency: group.currency,
            note: input.note ?? null,
            createdById: userId,
          },
          include: { fromUser: true, toUser: true },
        });
        const evt = await recordActivity(tx, {
          groupId,
          actorId: userId,
          type: 'SETTLEMENT_ADDED',
          summary: `${settlement.fromUser.name} paid ${settlement.toUser.name}`,
          amount: settlement.amount,
          currency: settlement.currency,
          settlementId: settlement.id,
        });
        return { settlementId: settlement.id, event: evt };
      });

      ctx.pubSub.publish('activity', event);
      return ctx.prisma.settlement.findUniqueOrThrow({ ...query, where: { id: settlementId } });
    },
  }),
}));
