import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ADD_EXPENSE,
  createGroup,
  disconnectPrisma,
  errorCode,
  gql,
  joinGroup,
  resetDatabase,
  signUp,
  type TestUser,
} from './helpers.js';

let owner: TestUser;
let friend: TestUser;
let outsider: TestUser;
let group: { id: string; inviteCode: string };

beforeAll(async () => {
  await resetDatabase();
  owner = await signUp('Owner');
  friend = await signUp('Friend');
  outsider = await signUp('Outsider');
  group = await createGroup(owner, 'Goa Trip');
});
afterAll(disconnectPrisma);

describe('groups', () => {
  it('creates a group with the creator as OWNER and an invite link', async () => {
    const result = await gql(
      `query($id: ID!) { group(id: $id) { name emoji currency inviteUrl viewerRole memberCount members { role user { id } } } }`,
      { id: group.id },
      owner.accessToken,
    );
    expect(result.data?.group).toMatchObject({
      name: 'Goa Trip',
      emoji: '🏖️',
      currency: 'INR',
      viewerRole: 'OWNER',
      memberCount: 1,
      inviteUrl: `https://splitease-lalit.vercel.app/join/${group.inviteCode}`,
    });
    expect(group.inviteCode).toMatch(/^[A-Z2-9]{8}$/);
  });

  it('rejects unsupported currencies', async () => {
    const result = await gql(
      `mutation { createGroup(input: { name: "X", currency: "DOGE" }) { id } }`,
      {},
      owner.accessToken,
    );
    expect(errorCode(result)).toBe('BAD_USER_INPUT');
  });

  it('requires authentication', async () => {
    expect(errorCode(await gql(`{ groups { id } }`))).toBe('UNAUTHENTICATED');
    expect(errorCode(await gql(`mutation { createGroup(input: { name: "X" }) { id } }`))).toBe('UNAUTHENTICATED');
  });

  it('previews and joins via invite code (case-insensitive, idempotent)', async () => {
    const preview = await gql(
      `query($code: String!) { invitePreview(code: $code) { name memberCount alreadyMember } }`,
      { code: group.inviteCode.toLowerCase() },
      friend.accessToken,
    );
    expect(preview.data?.invitePreview).toEqual({ name: 'Goa Trip', memberCount: 1, alreadyMember: false });

    await joinGroup(friend, group.inviteCode);
    await joinGroup(friend, group.inviteCode);
    const result = await gql(
      `query($id: ID!) { group(id: $id) { memberCount } }`,
      { id: group.id },
      friend.accessToken,
    );
    expect(result.data?.group.memberCount).toBe(2);
  });

  it('returns NOT_FOUND for an unknown invite code', async () => {
    expect(errorCode(await gql(`mutation { joinGroup(code: "ZZZZZZZZ") { id } }`, {}, friend.accessToken))).toBe(
      'NOT_FOUND',
    );
  });

  it('lists only groups the viewer belongs to', async () => {
    const mine = await gql(`{ groups { id } }`, {}, outsider.accessToken);
    expect(mine.data?.groups).toEqual([]);
  });
});

describe('authorization: non-members', () => {
  it('cannot read a group', async () => {
    const result = await gql(`query($id: ID!) { group(id: $id) { name } }`, { id: group.id }, outsider.accessToken);
    expect(errorCode(result)).toBe('FORBIDDEN');
    expect(result.data).toBeNull();
  });

  it('cannot add expenses, settle up, or rename the group', async () => {
    const expense = await gql(
      ADD_EXPENSE,
      {
        groupId: group.id,
        input: {
          description: 'Sneaky',
          amount: 1000,
          paidById: outsider.id,
          date: new Date().toISOString(),
          splitMode: 'EQUAL',
          participants: [{ userId: owner.id }],
        },
      },
      outsider.accessToken,
    );
    expect(errorCode(expense)).toBe('FORBIDDEN');

    const settle = await gql(
      `mutation($g: ID!, $i: SettlementInput!) { settleUp(groupId: $g, input: $i) { id } }`,
      { g: group.id, i: { fromUserId: owner.id, toUserId: friend.id, amount: 100 } },
      outsider.accessToken,
    );
    expect(errorCode(settle)).toBe('FORBIDDEN');

    const rename = await gql(
      `mutation($id: ID!) { updateGroup(id: $id, input: { name: "Mine now" }) { id } }`,
      { id: group.id },
      outsider.accessToken,
    );
    expect(errorCode(rename)).toBe('FORBIDDEN');
  });

  it('cannot add a non-member to an expense even as a member', async () => {
    const result = await gql(
      ADD_EXPENSE,
      {
        groupId: group.id,
        input: {
          description: 'Includes outsider',
          amount: 1000,
          paidById: owner.id,
          date: new Date().toISOString(),
          splitMode: 'EQUAL',
          participants: [{ userId: owner.id }, { userId: outsider.id }],
        },
      },
      owner.accessToken,
    );
    expect(errorCode(result)).toBe('BAD_USER_INPUT');
  });

  it('only the owner can reset the invite code; the old code then stops working', async () => {
    const byMember = await gql(
      `mutation($id: ID!) { regenerateInviteCode(groupId: $id) { inviteCode } }`,
      { id: group.id },
      friend.accessToken,
    );
    expect(errorCode(byMember)).toBe('FORBIDDEN');

    const byOwner = await gql(
      `mutation($id: ID!) { regenerateInviteCode(groupId: $id) { inviteCode } }`,
      { id: group.id },
      owner.accessToken,
    );
    expect(byOwner.data?.regenerateInviteCode.inviteCode).not.toBe(group.inviteCode);
    const stale = await gql(
      `mutation($c: String!) { joinGroup(code: $c) { id } }`,
      { c: group.inviteCode },
      outsider.accessToken,
    );
    expect(errorCode(stale)).toBe('NOT_FOUND');
  });

  it('locks the currency once expenses exist', async () => {
    await gql(
      ADD_EXPENSE,
      {
        groupId: group.id,
        input: {
          description: 'Snacks',
          amount: 500,
          paidById: owner.id,
          date: new Date().toISOString(),
          splitMode: 'EQUAL',
          participants: [{ userId: owner.id }, { userId: friend.id }],
        },
      },
      owner.accessToken,
    );
    const result = await gql(
      `mutation($id: ID!) { updateGroup(id: $id, input: { name: "Goa", currency: "USD" }) { id } }`,
      { id: group.id },
      owner.accessToken,
    );
    expect(errorCode(result)).toBe('BAD_USER_INPUT');
    const rename = await gql(
      `mutation($id: ID!) { updateGroup(id: $id, input: { name: "Goa 2026", emoji: "🌴", currency: "INR" }) { name emoji } }`,
      { id: group.id },
      friend.accessToken,
    );
    expect(rename.data?.updateGroup).toEqual({ name: 'Goa 2026', emoji: '🌴' });
  });
});
