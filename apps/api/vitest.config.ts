import { defineConfig } from 'vitest/config';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://splitease:splitease@localhost:5436/splitease_test?schema=public';

export default defineConfig({
  resolve: {
    // graphql@16 ships both index.mjs ("module") and index.js ("main"). Node
    // (and therefore Yoga at runtime) loads index.js, but Vite would hand our
    // source index.mjs — two GraphQLError classes. Pin Node's choice.
    alias: [{ find: /^graphql$/, replacement: 'graphql/index.js' }],
  },
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // Integration tests share one database, so run files sequentially.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      DIRECT_URL: TEST_DATABASE_URL,
      JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdefghijklmnop',
      JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdefghijklmno',
      CORS_ORIGINS: 'http://localhost:8081',
      WEB_APP_URL: 'https://splitease-lalit.vercel.app',
    },
  },
});
