import { randomBytes, randomUUID } from 'node:crypto';

import {
  computeSplit,
  parseMoney,
  parsePercentToBasisPoints,
  type ExpenseCategory,
  type SplitMode,
} from '@splitease/shared';

import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { generateInviteCode, pickAvatarColor } from './groups.js';

/**
 * Realistic demo data: four groups (three in INR, one in THB to show
 * multi-currency), ~45 expenses across all four split modes, and a couple of
 * settlements. Used by `npm run db:seed` (fixed demo account) and by the
 * `loginDemo` mutation (a private sandbox per visitor).
 */

type FriendKey = 'priya' | 'rahul' | 'ananya' | 'vikram' | 'sneha' | 'karan';
type Who = 'me' | FriendKey;

const FRIENDS: Record<FriendKey, string> = {
  priya: 'Priya Patel',
  rahul: 'Rahul Verma',
  ananya: 'Ananya Iyer',
  vikram: 'Vikram Singh',
  sneha: 'Sneha Reddy',
  karan: 'Karan Mehta',
};

interface DemoExpense {
  description: string;
  /** In major units for readability (rupees / baht); converted to minor units below. */
  amount: number;
  paidBy: Who;
  category: ExpenseCategory;
  daysAgo: number;
  mode?: SplitMode;
  /** Participants; for non-EQUAL modes a value per participant (major units for EXACT, percent for PERCENT). */
  split: Who[] | Partial<Record<Who, number>>;
  notes?: string;
}

interface DemoGroup {
  name: string;
  emoji: string;
  currency: string;
  members: Who[];
  createdDaysAgo: number;
  expenses: DemoExpense[];
  settlements?: { from: Who; to: Who; amount: number; daysAgo: number; note?: string }[];
}

const GOA: Who[] = ['me', 'priya', 'rahul', 'ananya', 'vikram'];
const FLAT: Who[] = ['me', 'rahul', 'sneha', 'karan'];
const OFFICE: Who[] = ['me', 'priya', 'karan', 'ananya', 'vikram', 'sneha'];
const BKK: Who[] = ['me', 'rahul', 'sneha'];

export const DEMO_GROUPS: DemoGroup[] = [
  {
    name: 'Goa Trip',
    emoji: '🏖️',
    currency: 'INR',
    members: GOA,
    createdDaysAgo: 26,
    expenses: [
      {
        description: 'Flights BLR → GOI',
        amount: 42_500,
        paidBy: 'me',
        category: 'TRAVEL',
        daysAgo: 24,
        split: GOA,
        notes: 'IndiGo 6E-512, booked early',
      },
      {
        description: 'Villa in Assagao (3 nights)',
        amount: 36_000,
        paidBy: 'priya',
        category: 'STAY',
        daysAgo: 21,
        mode: 'SHARES',
        split: { me: 2, priya: 2, rahul: 1, ananya: 1, vikram: 1 },
        notes: 'Couples count as 2 shares',
      },
      {
        description: 'Scooter rentals',
        amount: 4_800,
        paidBy: 'rahul',
        category: 'TRANSPORT',
        daysAgo: 21,
        split: ['me', 'rahul', 'ananya', 'vikram'],
      },
      {
        description: "Seafood dinner at Britto's",
        amount: 7_850,
        paidBy: 'me',
        category: 'FOOD',
        daysAgo: 20,
        mode: 'EXACT',
        split: { me: 1_850, priya: 1_600, rahul: 1_450, ananya: 1_200, vikram: 1_750 },
      },
      {
        description: 'Beach shack drinks',
        amount: 3_240,
        paidBy: 'vikram',
        category: 'FOOD',
        daysAgo: 20,
        mode: 'PERCENT',
        split: { me: 25, priya: 15, rahul: 25, ananya: 10, vikram: 25 },
      },
      {
        description: 'Dudhsagar falls jeep safari',
        amount: 6_000,
        paidBy: 'ananya',
        category: 'ENTERTAINMENT',
        daysAgo: 19,
        split: GOA,
      },
      {
        description: 'Groceries & snacks',
        amount: 2_186.5,
        paidBy: 'priya',
        category: 'GROCERIES',
        daysAgo: 19,
        split: GOA,
      },
      {
        description: 'Parasailing at Calangute',
        amount: 9_000,
        paidBy: 'rahul',
        category: 'ENTERTAINMENT',
        daysAgo: 18,
        mode: 'SHARES',
        split: { me: 1, rahul: 1, vikram: 1 },
      },
      {
        description: 'Cab to airport',
        amount: 1_650,
        paidBy: 'vikram',
        category: 'TRANSPORT',
        daysAgo: 18,
        split: GOA,
      },
      {
        description: 'Cashew feni & souvenirs',
        amount: 2_400,
        paidBy: 'me',
        category: 'SHOPPING',
        daysAgo: 18,
        split: ['me', 'priya'],
      },
    ],
    settlements: [{ from: 'vikram', to: 'me', amount: 5_000, daysAgo: 10, note: 'UPI' }],
  },
  {
    name: 'Flat 402',
    emoji: '🏠',
    currency: 'INR',
    members: FLAT,
    createdDaysAgo: 60,
    expenses: [
      { description: 'October rent', amount: 52_000, paidBy: 'rahul', category: 'RENT', daysAgo: 6, split: FLAT },
      {
        description: 'Electricity bill (BESCOM)',
        amount: 3_462,
        paidBy: 'sneha',
        category: 'UTILITIES',
        daysAgo: 5,
        split: FLAT,
      },
      {
        description: 'ACT Fibernet Wi-Fi',
        amount: 1_179,
        paidBy: 'karan',
        category: 'UTILITIES',
        daysAgo: 4,
        split: FLAT,
      },
      {
        description: 'BigBasket order',
        amount: 2_845.75,
        paidBy: 'rahul',
        category: 'GROCERIES',
        daysAgo: 3,
        split: FLAT,
      },
      {
        description: 'House help salary',
        amount: 6_000,
        paidBy: 'me',
        category: 'UTILITIES',
        daysAgo: 2,
        mode: 'PERCENT',
        split: { me: 30, rahul: 30, sneha: 20, karan: 20 },
        notes: 'Sneha & Karan travel half the month',
      },
      {
        description: 'Gas cylinder refill',
        amount: 1_103,
        paidBy: 'sneha',
        category: 'UTILITIES',
        daysAgo: 2,
        split: FLAT,
      },
      {
        description: 'Weekend biryani order',
        amount: 1_480,
        paidBy: 'karan',
        category: 'FOOD',
        daysAgo: 1,
        split: FLAT,
      },
      { description: 'September rent', amount: 52_000, paidBy: 'me', category: 'RENT', daysAgo: 36, split: FLAT },
      {
        description: 'New mixer grinder',
        amount: 3_299,
        paidBy: 'sneha',
        category: 'SHOPPING',
        daysAgo: 30,
        split: FLAT,
      },
    ],
    settlements: [
      { from: 'karan', to: 'me', amount: 13_000, daysAgo: 33, note: 'September rent' },
      { from: 'sneha', to: 'me', amount: 13_000, daysAgo: 32, note: 'September rent' },
      { from: 'rahul', to: 'me', amount: 13_000, daysAgo: 32, note: 'September rent' },
    ],
  },
  {
    name: 'Office lunches',
    emoji: '🍱',
    currency: 'INR',
    members: OFFICE,
    createdDaysAgo: 40,
    expenses: [
      {
        description: 'Meghana Foods biryani',
        amount: 1_920,
        paidBy: 'karan',
        category: 'FOOD',
        daysAgo: 1,
        split: ['me', 'karan', 'priya', 'vikram'],
      },
      {
        description: 'Truffles burgers',
        amount: 1_640,
        paidBy: 'me',
        category: 'FOOD',
        daysAgo: 2,
        split: ['me', 'ananya', 'sneha', 'priya'],
      },
      { description: 'Filter coffee run', amount: 360, paidBy: 'ananya', category: 'FOOD', daysAgo: 2, split: OFFICE },
      { description: 'Friday team pizza', amount: 3_150, paidBy: 'priya', category: 'FOOD', daysAgo: 5, split: OFFICE },
      {
        description: 'Udupi thali',
        amount: 1_080,
        paidBy: 'vikram',
        category: 'FOOD',
        daysAgo: 7,
        split: ['me', 'vikram', 'karan', 'sneha'],
      },
      {
        description: "Sneha's birthday cake",
        amount: 1_250,
        paidBy: 'me',
        category: 'FOOD',
        daysAgo: 8,
        split: ['me', 'priya', 'karan', 'ananya', 'vikram'],
      },
      {
        description: 'Swiggy team order',
        amount: 2_235,
        paidBy: 'sneha',
        category: 'FOOD',
        daysAgo: 9,
        mode: 'EXACT',
        split: { me: 420, priya: 385, karan: 510, ananya: 300, vikram: 340, sneha: 280 },
      },
      {
        description: 'Chaat at VV Puram',
        amount: 540,
        paidBy: 'karan',
        category: 'FOOD',
        daysAgo: 12,
        split: ['me', 'karan', 'ananya'],
      },
    ],
  },
  {
    name: 'Bangkok Weekend',
    emoji: '✈️',
    currency: 'THB',
    members: BKK,
    createdDaysAgo: 14,
    expenses: [
      { description: 'Hotel in Sukhumvit', amount: 7_800, paidBy: 'rahul', category: 'STAY', daysAgo: 12, split: BKK },
      { description: 'Street food at Yaowarat', amount: 960, paidBy: 'me', category: 'FOOD', daysAgo: 11, split: BKK },
      { description: 'Grab rides', amount: 645, paidBy: 'sneha', category: 'TRANSPORT', daysAgo: 11, split: BKK },
      {
        description: 'Chatuchak market',
        amount: 2_350,
        paidBy: 'me',
        category: 'SHOPPING',
        daysAgo: 10,
        mode: 'EXACT',
        split: { me: 1_500, sneha: 850 },
      },
      {
        description: 'Rooftop bar',
        amount: 1_890,
        paidBy: 'sneha',
        category: 'ENTERTAINMENT',
        daysAgo: 10,
        split: BKK,
      },
    ],
  },
];

const DAY = 24 * 60 * 60 * 1000;
/** Seed values are written in major units; convert via the string parser so no float maths is involved. */
const toMinor = (major: number, currency = 'INR') => {
  const minor = parseMoney(String(major), currency);
  if (minor === null) throw new Error(`Invalid demo amount ${major}`);
  return minor;
};
const toBasisPoints = (percent: number) => {
  const bp = parsePercentToBasisPoints(String(percent));
  if (bp === null) throw new Error(`Invalid demo percentage ${percent}`);
  return bp;
};

export interface SeedOwner {
  email: string;
  name: string;
  passwordHash: string | null;
  isDemo: boolean;
}

/**
 * Create the owner, their friends, and all demo groups. Friends and groups
 * point at the owner via `demoOwnerId`, so deleting the owner removes the
 * whole workspace (cascade).
 */
export async function seedDemoWorkspace(prisma: PrismaClient, owner: SeedOwner, now = new Date()) {
  const ago = (days: number, hour = 13) => {
    const d = new Date(now.getTime() - days * DAY);
    d.setUTCHours(hour, 0, 0, 0);
    return d;
  };
  const suffix = randomBytes(4).toString('hex');

  return prisma.$transaction(
    async (tx) => {
      const me = await tx.user.create({
        data: {
          email: owner.email,
          name: owner.name,
          passwordHash: owner.passwordHash,
          isDemo: owner.isDemo,
          avatarColor: '#6366F1',
          createdAt: now,
        },
      });

      const ids = { me: me.id } as Record<Who, string>;
      const friendRows = (Object.keys(FRIENDS) as FriendKey[]).map((key) => {
        const id = randomUUID();
        ids[key] = id;
        return {
          id,
          name: FRIENDS[key],
          email: `${key}.${suffix}@demo.splitease.app`,
          passwordHash: null,
          isDemo: true,
          demoOwnerId: me.id,
          avatarColor: pickAvatarColor(FRIENDS[key]),
        };
      });
      await tx.user.createMany({ data: friendRows });

      const expenses: Prisma.ExpenseCreateManyInput[] = [];
      const shares: { expenseId: string; userId: string; amount: number; value: number | null }[] = [];
      const settlements: Prisma.SettlementCreateManyInput[] = [];
      const activities: Prisma.ActivityCreateManyInput[] = [];
      const groups: Prisma.GroupCreateManyInput[] = [];
      const members: { groupId: string; userId: string; role: 'OWNER' | 'MEMBER'; joinedAt: Date }[] = [];

      for (const g of DEMO_GROUPS) {
        const groupId = randomUUID();
        const created = ago(g.createdDaysAgo, 9);
        const lastActivity = ago(Math.min(...g.expenses.map((e) => e.daysAgo)), 18);
        groups.push({
          id: groupId,
          name: g.name,
          emoji: g.emoji,
          currency: g.currency,
          inviteCode: generateInviteCode(),
          createdById: me.id,
          demoOwnerId: me.id,
          createdAt: created,
          updatedAt: lastActivity,
        });
        g.members.forEach((who, i) =>
          members.push({
            groupId,
            userId: ids[who],
            role: who === 'me' ? 'OWNER' : 'MEMBER',
            joinedAt: new Date(created.getTime() + i * 60_000),
          }),
        );
        activities.push({ groupId, actorId: me.id, type: 'GROUP_CREATED', summary: g.name, createdAt: created });

        for (const e of g.expenses) {
          const expenseId = randomUUID();
          const amount = toMinor(e.amount, g.currency);
          const mode = e.mode ?? 'EQUAL';
          const participants = Array.isArray(e.split)
            ? e.split.map((who) => ({ userId: ids[who], value: null }))
            : (Object.entries(e.split) as [Who, number][]).map(([who, v]) => ({
                userId: ids[who],
                value: mode === 'EXACT' ? toMinor(v, g.currency) : mode === 'PERCENT' ? toBasisPoints(v) : v,
              }));
          const split = computeSplit(amount, mode, participants);
          if (!split.ok) throw new Error(`Bad demo expense "${e.description}": ${split.error}`);
          const date = ago(e.daysAgo, 12 + (e.description.length % 8));
          expenses.push({
            id: expenseId,
            groupId,
            description: e.description,
            amount,
            currency: g.currency,
            category: e.category,
            splitMode: mode,
            date,
            notes: e.notes ?? null,
            paidById: ids[e.paidBy],
            createdById: ids[e.paidBy],
            createdAt: date,
          });
          const valueByUser = new Map(participants.map((p) => [p.userId, p.value]));
          for (const s of split.shares) {
            shares.push({ expenseId, userId: s.userId, amount: s.amount, value: valueByUser.get(s.userId) ?? null });
          }
          activities.push({
            groupId,
            actorId: ids[e.paidBy],
            type: 'EXPENSE_ADDED',
            summary: e.description,
            amount,
            currency: g.currency,
            expenseId,
            createdAt: date,
          });
        }

        for (const s of g.settlements ?? []) {
          const settlementId = randomUUID();
          const date = ago(s.daysAgo, 20);
          settlements.push({
            id: settlementId,
            groupId,
            fromUserId: ids[s.from],
            toUserId: ids[s.to],
            amount: toMinor(s.amount, g.currency),
            currency: g.currency,
            note: s.note ?? null,
            date,
            createdById: ids[s.from],
            createdAt: date,
          });
          activities.push({
            groupId,
            actorId: ids[s.from],
            type: 'SETTLEMENT_ADDED',
            summary: `${s.from === 'me' ? owner.name : FRIENDS[s.from]} paid ${s.to === 'me' ? owner.name : FRIENDS[s.to]}`,
            amount: toMinor(s.amount, g.currency),
            currency: g.currency,
            settlementId,
            createdAt: date,
          });
        }
      }

      await tx.group.createMany({ data: groups });
      await tx.groupMember.createMany({ data: members });
      await tx.expense.createMany({ data: expenses });
      await tx.expenseShare.createMany({ data: shares });
      await tx.settlement.createMany({ data: settlements });
      await tx.activity.createMany({ data: activities });

      return me.id;
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}

export const DEMO_SANDBOX_TTL_HOURS = 24;

/** Delete expired sandboxes (cascade removes their friends, groups and data). */
export async function cleanupDemoSandboxes(prisma: PrismaClient, now = new Date()) {
  const cutoff = new Date(now.getTime() - DEMO_SANDBOX_TTL_HOURS * 60 * 60 * 1000);
  const { count } = await prisma.user.deleteMany({
    where: { isDemo: true, demoOwnerId: null, createdAt: { lt: cutoff } },
  });
  return count;
}

/** `loginDemo`: a fresh private sandbox per visitor so demo users never see each other's edits. */
export async function createDemoSandbox(prisma: PrismaClient) {
  await cleanupDemoSandboxes(prisma).catch(() => undefined);
  return seedDemoWorkspace(prisma, {
    email: `guest.${randomBytes(6).toString('hex')}@demo.splitease.app`,
    name: 'Aarav Sharma',
    passwordHash: null,
    isDemo: true,
  });
}

export const DEMO_ACCOUNT = { email: 'demo@splitease.app', password: 'splitease-demo', name: 'Aarav Sharma' } as const;
