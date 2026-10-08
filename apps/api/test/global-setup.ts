import { execSync } from 'node:child_process';

/** Apply migrations to the test database once before the suite. */
export default function setup() {
  const url =
    process.env.TEST_DATABASE_URL ?? 'postgresql://splitease:splitease@localhost:5436/splitease_test?schema=public';
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}
