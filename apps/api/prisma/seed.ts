/**
 * Seeds the fixed demo account (demo@splitease.app / splitease-demo) with
 * realistic groups and expenses. Idempotent: re-running replaces the demo
 * workspace. Works against local Postgres and Neon (uses DATABASE_URL).
 */
import { hashPassword } from '../src/auth/password.js';
import { disconnectPrisma, getPrisma } from '../src/db.js';
import { cleanupDemoSandboxes, DEMO_ACCOUNT, seedDemoWorkspace } from '../src/services/demo.js';

async function main() {
  const prisma = getPrisma();
  await prisma.user.deleteMany({ where: { email: DEMO_ACCOUNT.email } });
  const removed = await cleanupDemoSandboxes(prisma);
  const userId = await seedDemoWorkspace(prisma, {
    email: DEMO_ACCOUNT.email,
    name: DEMO_ACCOUNT.name,
    passwordHash: await hashPassword(DEMO_ACCOUNT.password),
    isDemo: false,
  });
  const groups = await prisma.group.count({ where: { members: { some: { userId } } } });
  const expenses = await prisma.expense.count({ where: { group: { members: { some: { userId } } } } });
  console.log(
    `Seeded ${DEMO_ACCOUNT.email} with ${groups} groups and ${expenses} expenses (cleaned ${removed} expired sandboxes).`,
  );
  console.log(`Log in with ${DEMO_ACCOUNT.email} / ${DEMO_ACCOUNT.password}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
