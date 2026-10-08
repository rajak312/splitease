import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashRefreshToken, signAccessToken, verifyAccessToken } from '../src/auth/tokens.js';
import { disconnectPrisma, errorCode, gql, prisma, resetDatabase, signUp } from './helpers.js';

const LOGIN = `mutation($input: LoginInput!) { login(input: $input) { accessToken refreshToken user { id name email } } }`;
const REFRESH = `mutation($t: String!) { refreshSession(refreshToken: $t) { accessToken refreshToken } }`;
const ME = `{ me { id name email } }`;

beforeAll(resetDatabase);
afterAll(disconnectPrisma);

describe('sign up & login', () => {
  it('signs up, hashes the password, and returns a working access token', async () => {
    const user = await signUp('Asha Rao');
    const me = await gql<{ me: { id: string; email: string } }>(ME, {}, user.accessToken);
    expect(me.data?.me).toMatchObject({ id: user.id, email: user.email });

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row.passwordHash).not.toContain('correct horse');
  });

  it('rejects a duplicate email with CONFLICT', async () => {
    const user = await signUp('Dup');
    const again = await gql(`mutation($input: SignUpInput!) { signUp(input: $input) { accessToken } }`, {
      input: { name: 'Dup 2', email: user.email.toUpperCase(), password: 'another password' },
    });
    expect(errorCode(again)).toBe('CONFLICT');
  });

  it('validates input with the shared zod schema', async () => {
    const result = await gql(`mutation($input: SignUpInput!) { signUp(input: $input) { accessToken } }`, {
      input: { name: '', email: 'not-an-email', password: 'short' },
    });
    expect(errorCode(result)).toBe('BAD_USER_INPUT');
    expect(result.errors?.[0]?.extensions?.fields).toHaveProperty('email');
  });

  it('logs in with the right password and rejects the wrong one (same message for unknown emails)', async () => {
    const user = await signUp('Login Person');
    const ok = await gql(LOGIN, { input: { email: user.email, password: 'correct horse battery' } });
    expect(ok.data?.login.user.id).toBe(user.id);

    const wrong = await gql(LOGIN, { input: { email: user.email, password: 'wrong password' } });
    const unknown = await gql(LOGIN, { input: { email: 'nobody@example.com', password: 'whatever123' } });
    expect(errorCode(wrong)).toBe('BAD_USER_INPUT');
    expect(wrong.errors?.[0]?.message).toBe(unknown.errors?.[0]?.message);
  });

  it('treats missing / invalid / tampered access tokens as anonymous', async () => {
    const user = await signUp('Token Person');
    expect((await gql(ME)).data?.me).toBeNull();
    const tampered = `${user.accessToken.slice(0, -4)}abcd`;
    expect((await gql(ME, {}, tampered)).data?.me).toBeNull();
    expect(errorCode(await gql(`{ groups { id } }`, {}, tampered))).toBe('UNAUTHENTICATED');
  });

  it('signs verifiable short-lived JWTs', async () => {
    const { token, expiresAt } = await signAccessToken('user-123');
    expect(await verifyAccessToken(token)).toEqual({ userId: 'user-123' });
    expect(expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000);
    expect(await verifyAccessToken('garbage')).toBeNull();
  });
});

describe('refresh token rotation', () => {
  it('stores only an HMAC of the refresh token', async () => {
    const user = await signUp('Hash Check');
    const rows = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(hashRefreshToken(user.refreshToken));
    expect(rows[0]!.tokenHash).not.toBe(user.refreshToken);
  });

  it('rotates: each refresh returns a new pair and the old refresh token stops working', async () => {
    const user = await signUp('Rotator');
    const first = await gql(REFRESH, { t: user.refreshToken });
    const pair = first.data?.refreshSession;
    expect(pair?.refreshToken).toBeTruthy();
    expect(pair?.refreshToken).not.toBe(user.refreshToken);
    expect((await gql(ME, {}, pair.accessToken)).data?.me.id).toBe(user.id);

    const second = await gql(REFRESH, { t: pair.refreshToken });
    expect(second.data?.refreshSession.refreshToken).toBeTruthy();
  });

  it('detects reuse of a rotated token and revokes the whole family', async () => {
    const user = await signUp('Victim');
    const rotated = (await gql(REFRESH, { t: user.refreshToken })).data?.refreshSession;

    // Attacker replays the original (already rotated) token.
    const replay = await gql(REFRESH, { t: user.refreshToken });
    expect(errorCode(replay)).toBe('UNAUTHENTICATED');
    expect(replay.errors?.[0]?.extensions?.reason).toBe('reused');

    // The legitimate, newer token is now revoked too.
    const legit = await gql(REFRESH, { t: rotated.refreshToken });
    expect(errorCode(legit)).toBe('UNAUTHENTICATED');
  });

  it('only one of two concurrent refreshes with the same token succeeds', async () => {
    const user = await signUp('Racer');
    const results = await Promise.all([gql(REFRESH, { t: user.refreshToken }), gql(REFRESH, { t: user.refreshToken })]);
    expect(results.filter((r) => r.data?.refreshSession).length).toBe(1);
  });

  it('rejects expired and unknown refresh tokens', async () => {
    const user = await signUp('Expired');
    await prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await gql(REFRESH, { t: user.refreshToken });
    expect(expired.errors?.[0]?.extensions?.reason).toBe('expired');
    const unknown = await gql(REFRESH, { t: 'definitely-not-a-token' });
    expect(unknown.errors?.[0]?.extensions?.reason).toBe('invalid');
  });

  it('logout revokes the refresh token family', async () => {
    const user = await signUp('Leaver');
    const result = await gql(`mutation($t: String!) { logout(refreshToken: $t) }`, { t: user.refreshToken });
    expect(result.data?.logout).toBe(true);
    expect(errorCode(await gql(REFRESH, { t: user.refreshToken }))).toBe('UNAUTHENTICATED');
  });
});
