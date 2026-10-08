import { PrismaPg } from '@prisma/adapter-pg';
import { attachDatabasePool } from '@vercel/functions';
import pg from 'pg';

import { getEnv } from './env.js';
import { PrismaClient } from './generated/prisma/client.js';

/**
 * Prisma 7 is engine-less: queries go through a driver adapter. We hand it a
 * `pg` Pool so the same code works against local Postgres and Neon's pooled
 * (PgBouncer) endpoint on Vercel. The client is cached on globalThis so warm
 * serverless invocations and dev hot-reloads reuse connections.
 */
const globalForPrisma = globalThis as unknown as {
  __prisma?: PrismaClient;
  __pgPool?: pg.Pool;
};

export function createPrismaClient(connectionString = getEnv().DATABASE_URL) {
  const pool = new pg.Pool({
    connectionString,
    max: getEnv().DATABASE_POOL_MAX,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  // On Vercel Fluid compute, release idle connections before the instance is
  // suspended. A no-op everywhere else.
  attachDatabasePool(pool);
  return { prisma: new PrismaClient({ adapter: new PrismaPg(pool) }), pool };
}

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.__prisma) {
    const { prisma, pool } = createPrismaClient();
    globalForPrisma.__prisma = prisma;
    globalForPrisma.__pgPool = pool;
  }
  return globalForPrisma.__prisma;
}

export async function disconnectPrisma() {
  await globalForPrisma.__prisma?.$disconnect();
  await globalForPrisma.__pgPool?.end().catch(() => undefined);
  globalForPrisma.__prisma = undefined;
  globalForPrisma.__pgPool = undefined;
}

export type { PrismaClient };
