import { createPubSub } from 'graphql-yoga';

/**
 * In-process pub/sub for GraphQL subscriptions. Fine for a single Node
 * process (local dev / a long-running container). On Vercel each serverless
 * instance has its own memory, so clients fall back to polling there — see
 * README "Realtime". Swapping in Redis/Upstash would only change this file
 * (`createPubSub({ eventTarget: createRedisEventTarget(...) })`).
 */
export interface ActivityEvent {
  activityId: string;
  groupId: string;
  /** Members at publish time, so the subscription filter needs no DB query. */
  memberIds: string[];
}

export const pubSub = createPubSub<{ activity: [ActivityEvent] }>();
export type PubSub = typeof pubSub;
