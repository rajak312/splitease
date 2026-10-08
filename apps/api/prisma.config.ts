import 'dotenv/config';

import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 config. The CLI (migrate / seed) should talk to Postgres directly,
 * so it prefers DIRECT_URL (Neon "direct" connection) and falls back to
 * DATABASE_URL. The runtime client uses DATABASE_URL (Neon pooled) through the
 * `pg` driver adapter — see src/db.ts.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
});
