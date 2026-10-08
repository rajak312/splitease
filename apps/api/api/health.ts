import { getPrisma } from '../src/db.js';

/** GET /health — liveness + database connectivity, used to verify a deployment. */
export async function GET() {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return Response.json({ ok: true, database: 'up' });
  } catch {
    return Response.json({ ok: false, database: 'down' }, { status: 503 });
  }
}
