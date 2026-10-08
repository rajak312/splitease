import { randomInt } from 'node:crypto';

import type { Context } from '../context.js';
import { forbidden } from '../errors.js';
import type { ActivityType, PrismaClient } from '../generated/prisma/client.js';

// No 0/O/1/I so codes are easy to read aloud and type.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateInviteCode(length = 8) {
  let code = '';
  for (let i = 0; i < length; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** Throws FORBIDDEN unless the viewer belongs to the group. Batched via DataLoader. */
export async function assertMember(ctx: Context, groupId: string) {
  if (!ctx.userId) throw forbidden();
  const membership = await ctx.loaders.membership.load(groupId);
  if (!membership) throw forbidden('You are not a member of this group');
  return membership;
}

export const AVATAR_COLORS = [
  '#6366F1',
  '#EC4899',
  '#F59E0B',
  '#10B981',
  '#3B82F6',
  '#8B5CF6',
  '#EF4444',
  '#14B8A6',
  '#F97316',
  '#0EA5E9',
];

export function pickAvatarColor(seed: string) {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}

interface ActivityInput {
  groupId: string;
  actorId: string;
  type: ActivityType;
  summary: string;
  amount?: number | null;
  currency?: string | null;
  expenseId?: string | null;
  settlementId?: string | null;
}

type Tx = Pick<PrismaClient, 'activity' | 'groupMember'>;

/** Write an activity row (inside the caller's transaction) and return what to publish after commit. */
export async function recordActivity(tx: Tx, input: ActivityInput) {
  const activity = await tx.activity.create({ data: input });
  const members = await tx.groupMember.findMany({ where: { groupId: input.groupId }, select: { userId: true } });
  return { activityId: activity.id, groupId: input.groupId, memberIds: members.map((m) => m.userId) };
}
