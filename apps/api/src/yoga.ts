import { EnvelopArmorPlugin } from '@escape.tech/graphql-armor';
import { useDisableIntrospection } from '@graphql-yoga/plugin-disable-introspection';
import { createYoga, type Plugin } from 'graphql-yoga';

import { createContext, type Context } from './context.js';
import { getEnv } from './env.js';
import { schema } from './schema/index.js';

export const GRAPHQL_ENDPOINT = '/graphql';

/**
 * One Yoga instance serves both the local Node server (src/server.ts) and the
 * Vercel function (api/graphql.ts).
 */
export function createApp() {
  const env = getEnv();
  const production = env.NODE_ENV === 'production';
  const origins = env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const plugins: Plugin[] = [
    // Reject abusive documents before they execute.
    EnvelopArmorPlugin({
      maxDepth: { n: 12 },
      costLimit: { maxCost: 5000, objectCost: 2, scalarCost: 1, depthCostFactor: 1.5 },
      maxAliases: { n: 15 },
      maxDirectives: { n: 20 },
      maxTokens: { n: 2000 },
      blockFieldSuggestion: { enabled: production },
    }),
  ];
  if (production && !env.ALLOW_INTROSPECTION) plugins.push(useDisableIntrospection());

  return createYoga<Record<string, unknown>, Context>({
    schema,
    context: createContext,
    graphqlEndpoint: GRAPHQL_ENDPOINT,
    plugins,
    // Unexpected errors become "Unexpected error." in production; GraphQLErrors
    // we throw on purpose (UNAUTHENTICATED, BAD_USER_INPUT…) pass through.
    maskedErrors: { isDev: !production },
    graphiql: production
      ? false
      : {
          title: 'SplitEase GraphQL',
          defaultQuery:
            '# Tip: run the loginDemo mutation, then add\n# {"Authorization": "Bearer <accessToken>"} as a header.\n\nmutation {\n  loginDemo {\n    accessToken\n    user { name }\n  }\n}\n',
          subscriptionsProtocol: 'SSE',
        },
    landingPage: !production,
    cors: {
      origin: origins.length > 0 ? origins : '*',
      credentials: false,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
      maxAge: 86_400,
    },
    healthCheckEndpoint: '/health',
    logging: production ? 'warn' : 'info',
  });
}

export type App = ReturnType<typeof createApp>;
