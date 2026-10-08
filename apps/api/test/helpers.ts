import { disconnectPrisma, getPrisma } from '../src/db.js';
import { createApp } from '../src/yoga.js';

export const app = createApp();
export const prisma = getPrisma();

export interface GqlResult<T = Record<string, any>> {
  data?: T | null;
  errors?: { message: string; extensions?: { code?: string; fields?: Record<string, string>; reason?: string } }[];
}

/** Execute a GraphQL operation against the Yoga app in-process (no HTTP server needed). */
export async function gql<T = Record<string, any>>(
  query: string,
  variables: Record<string, unknown> = {},
  token?: string,
  target = app,
): Promise<GqlResult<T>> {
  const response = await target.fetch('http://localhost/graphql', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  return (await response.json()) as GqlResult<T>;
}

export function errorCode(result: GqlResult) {
  return result.errors?.[0]?.extensions?.code;
}

export async function resetDatabase() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Activity", "Settlement", "ExpenseShare", "Expense", "GroupMember", "Group", "RefreshToken", "User" CASCADE',
  );
}

let counter = 0;
export async function signUp(name = 'Test User') {
  counter += 1;
  const email = `${name.toLowerCase().replace(/\W+/g, '.')}.${Date.now()}.${counter}@example.com`;
  const result = await gql<{ signUp: { accessToken: string; refreshToken: string; user: { id: string } } }>(
    `mutation($input: SignUpInput!) { signUp(input: $input) { accessToken refreshToken user { id } } }`,
    { input: { name, email, password: 'correct horse battery' } },
  );
  if (!result.data) throw new Error(JSON.stringify(result.errors));
  return { ...result.data.signUp, id: result.data.signUp.user.id, email, name };
}

export type TestUser = Awaited<ReturnType<typeof signUp>>;

export async function createGroup(owner: TestUser, name = 'Trip', currency = 'INR') {
  const result = await gql<{ createGroup: { id: string; inviteCode: string } }>(
    `mutation($input: GroupInput!) { createGroup(input: $input) { id inviteCode } }`,
    { input: { name, emoji: '🏖️', currency } },
    owner.accessToken,
  );
  if (!result.data) throw new Error(JSON.stringify(result.errors));
  return result.data.createGroup;
}

export async function joinGroup(user: TestUser, code: string) {
  const result = await gql(`mutation($code: String!) { joinGroup(code: $code) { id } }`, { code }, user.accessToken);
  if (result.errors) throw new Error(JSON.stringify(result.errors));
}

export const ADD_EXPENSE = `
  mutation($groupId: ID!, $input: ExpenseInput!) {
    createExpense(groupId: $groupId, input: $input) {
      id amount splitMode myShare
      shares { amount value user { id } }
    }
  }`;

export const BALANCES = `
  query($id: ID!) {
    group(id: $id) {
      myBalance totalSpent expenseCount
      balances { net user { id } }
      simplifiedDebts { amount from { id } to { id } }
    }
  }`;

export { disconnectPrisma };
