/**
 * Vercel serverless entry (Node.js runtime, Web-standard Request/Response).
 * vercel.json rewrites /graphql → /api/graphql; we normalise the path so Yoga
 * sees its configured endpoint whichever URL was used.
 */
import { createApp, GRAPHQL_ENDPOINT } from '../src/yoga.js';

let app: ReturnType<typeof createApp> | undefined;

function handle(request: Request): Promise<Response> | Response {
  app ??= createApp();
  const url = new URL(request.url);
  if (url.pathname !== GRAPHQL_ENDPOINT) {
    url.pathname = GRAPHQL_ENDPOINT;
    request = new Request(url, request);
  }
  return app.fetch(request);
}

export const GET = handle;
export const POST = handle;
export const OPTIONS = handle;
