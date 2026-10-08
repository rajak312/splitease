import { createServer } from 'node:http';

import { disconnectPrisma } from './db.js';
import { getEnv } from './env.js';
import { createApp, GRAPHQL_ENDPOINT } from './yoga.js';

const env = getEnv();
const yoga = createApp();
const server = createServer(yoga);

server.listen(env.PORT, () => {
  console.log(`🚀 SplitEase API ready at http://localhost:${env.PORT}${GRAPHQL_ENDPOINT}`);
});

const shutdown = () => {
  server.close(() => {
    void disconnectPrisma().finally(() => process.exit(0));
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
