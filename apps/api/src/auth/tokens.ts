import { createHmac, randomBytes, randomUUID } from 'node:crypto';

import { jwtVerify, SignJWT } from 'jose';

import { getEnv } from '../env.js';
import type { PrismaClient } from '../generated/prisma/client.js';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 30;

const ISSUER = 'splitease-api';
const AUDIENCE = 'splitease-app';

const accessKey = () => new TextEncoder().encode(getEnv().JWT_ACCESS_SECRET);

export interface AccessTokenClaims {
  userId: string;
}

/** Short-lived, stateless JWT (HS256) sent as `Authorization: Bearer …`. */
export async function signAccessToken(userId: string) {
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(accessKey());
  return { token, expiresAt };
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, accessKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    return payload.sub ? { userId: payload.sub } : null;
  } catch {
    return null;
  }
}

/**
 * Refresh tokens are opaque random strings (not JWTs). Only an HMAC of the
 * token is stored, keyed with JWT_REFRESH_SECRET, so a database leak does not
 * yield usable tokens.
 */
export function hashRefreshToken(token: string) {
  return createHmac('sha256', getEnv().JWT_REFRESH_SECRET).update(token).digest('base64url');
}

function newRefreshTokenValue() {
  return randomBytes(32).toString('base64url');
}

export interface IssuedSession {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  userId: string;
}

async function storeRefreshToken(prisma: PrismaClient, userId: string, familyId: string) {
  const refreshToken = newRefreshTokenValue();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  const record = await prisma.refreshToken.create({
    data: { userId, familyId, tokenHash: hashRefreshToken(refreshToken), expiresAt },
  });
  return { refreshToken, record };
}

/** Start a brand-new session (login / sign-up): new token family. */
export async function issueSession(prisma: PrismaClient, userId: string): Promise<IssuedSession> {
  const [{ token, expiresAt }, { refreshToken, record }] = await Promise.all([
    signAccessToken(userId),
    storeRefreshToken(prisma, userId, randomUUID()),
  ]);
  return {
    accessToken: token,
    accessTokenExpiresAt: expiresAt,
    refreshToken,
    refreshTokenExpiresAt: record.expiresAt,
    userId,
  };
}

export type RotateResult =
  { ok: true; session: IssuedSession } | { ok: false; reason: 'invalid' | 'expired' | 'reused' };

/**
 * Refresh-token rotation with reuse detection:
 * - a valid token is revoked and replaced by a new one in the same family;
 * - presenting an already-rotated token means it was stolen (or replayed),
 *   so every token in that family is revoked and the user must log in again.
 * The revoke is a conditional update, so two concurrent refreshes with the
 * same token cannot both succeed.
 */
export async function rotateRefreshToken(prisma: PrismaClient, presented: string): Promise<RotateResult> {
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash: hashRefreshToken(presented) } });
  if (!existing) return { ok: false, reason: 'invalid' };

  if (existing.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: false, reason: 'reused' };
  }
  if (existing.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' };

  const claimed = await prisma.refreshToken.updateMany({
    where: { id: existing.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (claimed.count !== 1) {
    // Lost a race with another refresh using the same token → treat as reuse.
    await prisma.refreshToken.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: false, reason: 'reused' };
  }

  const [{ token, expiresAt }, { refreshToken, record }] = await Promise.all([
    signAccessToken(existing.userId),
    storeRefreshToken(prisma, existing.userId, existing.familyId),
  ]);
  await prisma.refreshToken.update({ where: { id: existing.id }, data: { replacedById: record.id } });

  return {
    ok: true,
    session: {
      accessToken: token,
      accessTokenExpiresAt: expiresAt,
      refreshToken,
      refreshTokenExpiresAt: record.expiresAt,
      userId: existing.userId,
    },
  };
}

/** Logout: revoke the presented token's whole family. Idempotent. */
export async function revokeRefreshToken(prisma: PrismaClient, presented: string) {
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash: hashRefreshToken(presented) } });
  if (!existing) return false;
  await prisma.refreshToken.updateMany({
    where: { familyId: existing.familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return true;
}
