import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resetEnvCache } from '../src/env.js';
import { createApp } from '../src/yoga.js';
import {
  ADD_EXPENSE,
  app,
  createGroup,
  disconnectPrisma,
  errorCode,
  gql,
  joinGroup,
  resetDatabase,
  signUp,
  type TestUser,
} from './helpers.js';

let alice: TestUser;
let bob: TestUser;
let mallory: TestUser;
let groupId: string;

beforeAll(async () => {
  await resetDatabase();
  alice = await signUp('Alice');
  bob = await signUp('Bob');
  mallory = await signUp('Mallory');
  const group = await createGroup(alice, 'Realtime');
  groupId = group.id;
  await joinGroup(bob, group.inviteCode);
});
afterAll(disconnectPrisma);

/** Open an SSE subscription and resolve with the first `next` payload. */
async function firstEvent(token: string, query: string, variables: Record<string, unknown>) {
  const controller = new AbortController();
  const response = await app.fetch('http://localhost/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
    signal: controller.signal,
  });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  return {
    controller,
    next: (async () => {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) throw new Error('stream ended');
        buffer += decoder.decode(value, { stream: true });
        const match = /event: next\ndata: (.+)\n/.exec(buffer);
        if (match) {
          controller.abort();
          return JSON.parse(match[1]!) as { data?: any; errors?: any[] };
        }
      }
    })(),
  };
}

const SUB = `subscription($g: ID) { activityAdded(groupId: $g) { type summary amount actor { id } group { id } } }`;

describe('realtime (SSE subscriptions)', () => {
  it('pushes new expenses to other members of the group', async () => {
    const sub = await firstEvent(bob.accessToken, SUB, { g: groupId });
    await new Promise((r) => setTimeout(r, 50));
    await gql(
      ADD_EXPENSE,
      {
        groupId,
        input: {
          description: 'Late-night maggi',
          amount: 24000,
          paidById: alice.id,
          date: new Date().toISOString(),
          splitMode: 'EQUAL',
          participants: [{ userId: alice.id }, { userId: bob.id }],
        },
      },
      alice.accessToken,
    );
    const event = await sub.next;
    expect(event.data?.activityAdded).toMatchObject({
      type: 'EXPENSE_ADDED',
      summary: 'Late-night maggi',
      amount: 24000,
      actor: { id: alice.id },
      group: { id: groupId },
    });
  });

  it('does not let non-members subscribe to a group', async () => {
    const sub = await firstEvent(mallory.accessToken, SUB, { g: groupId });
    const event = await sub.next;
    expect(event.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
  });
});

describe('query hardening', () => {
  it('rejects overly deep queries', async () => {
    const deep = `{ groups { members { user { id } } expenses { edges { node { group { expenses { edges { node { group { expenses { edges { node { id } } } } } } } } } } } } }`;
    const result = await gql(deep, {}, alice.accessToken);
    expect(result.errors?.[0]?.message).toMatch(/depth/i);
  });

  it('rejects alias-amplification attacks', async () => {
    const aliases = Array.from({ length: 30 }, (_, i) => `a${i}: me { id }`).join(' ');
    const result = await gql(`{ ${aliases} }`, {}, alice.accessToken);
    expect(result.errors?.[0]?.message).toMatch(/alias/i);
  });

  it('allows introspection in development but disables it in production', async () => {
    const query = `{ __schema { queryType { name } } }`;
    expect((await gql(query)).data?.__schema.queryType.name).toBe('Query');

    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    resetEnvCache();
    try {
      const prodApp = createApp();
      const result = await gql(query, {}, undefined, prodApp);
      expect(result.errors?.[0]?.message).toMatch(/introspection/i);
      // Unexpected internal errors are masked in production.
      const masked = await gql(`{ group(id: "x") { id } }`, {}, alice.accessToken, prodApp);
      expect(errorCode(masked)).toBe('FORBIDDEN');
    } finally {
      process.env.NODE_ENV = previous;
      resetEnvCache();
    }
  });

  it('serves a health check', async () => {
    const response = await app.fetch('http://localhost/health');
    expect(response.status).toBe(200);
  });
});
