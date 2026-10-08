import { computeSplit, type SplitMode } from '@splitease/shared';
import { authExchange } from '@urql/exchange-auth';
import { cacheExchange, offlineExchange, type Cache, type CacheExchangeOpts } from '@urql/exchange-graphcache';
import { relayPagination } from '@urql/exchange-graphcache/extras';
import { Client, fetchExchange, subscriptionExchange } from 'urql';
import { fetch as expoFetch } from 'expo/fetch';
import { createClient as createSSEClient } from 'graphql-sse';
import { Platform } from 'react-native';

import schema from '../graphql/generated/schema';
import { type AuthManager, SessionExpiredError } from './auth-manager';
import { createCacheStorage } from './cache-storage';
import { API_URL, REALTIME_MODE } from './config';

/** Group fields derived from expenses/settlements — refetched after any money mutation. */
const GROUP_DERIVED_FIELDS = new Set([
  'expenses',
  'balances',
  'simplifiedDebts',
  'myBalance',
  'totalSpent',
  'expenseCount',
  'categoryBreakdown',
  'activity',
  'settlements',
]);

function invalidateGroupMoney(cache: Cache, groupId: string | null | undefined) {
  if (groupId) {
    const key = cache.keyOfEntity({ __typename: 'Group', id: groupId });
    if (key) {
      for (const field of cache.inspectFields(key)) {
        if (GROUP_DERIVED_FIELDS.has(field.fieldName)) cache.invalidate(key, field.fieldName, field.arguments);
      }
    }
  }
  for (const field of cache.inspectFields('Query')) {
    if (field.fieldName === 'dashboard' || field.fieldName === 'activity' || field.fieldName === 'groups') {
      cache.invalidate('Query', field.fieldName, field.arguments);
    }
  }
}

let tempIds = 0;

interface ExpenseInputArgs {
  description: string;
  amount: number;
  paidById: string;
  category?: string | null;
  date: string;
  splitMode: SplitMode;
  participants: { userId: string; value?: number | null }[];
}

export function createUrqlClient(auth: AuthManager, viewerId: () => string | null) {
  const sse =
    REALTIME_MODE === 'sse'
      ? createSSEClient({
          url: API_URL,
          // React Native's fetch can't stream; expo/fetch can.
          fetchFn: Platform.OS === 'web' ? globalThis.fetch : (expoFetch as unknown as typeof fetch),
          headers: async () => {
            if (auth.isAccessTokenExpiring()) await auth.refresh().catch(() => null);
            const token = auth.getAccessToken();
            return token ? { Authorization: `Bearer ${token}` } : ({} as Record<string, string>);
          },
          retryAttempts: 5,
        })
      : null;

  const cacheOptions: CacheExchangeOpts = {
    schema,
    keys: {
      Dashboard: () => null,
      CurrencyTotal: () => null,
      FriendBalance: () => null,
      MemberBalance: () => null,
      Debt: () => null,
      CategoryTotal: () => null,
      AuthPayload: () => null,
      InvitePreview: (data) => (data.code as string) ?? null,
      GroupExpensesConnection: () => null,
      GroupExpensesEdge: () => null,
      QueryActivityConnection: () => null,
      QueryActivityConnectionEdge: () => null,
      PageInfo: () => null,
    },
    resolvers: {
      Group: { expenses: relayPagination() },
      Query: {
        activity: relayPagination(),
        group: (_parent, args) => ({ __typename: 'Group', id: args.id as string }),
        expense: (_parent, args) => ({ __typename: 'Expense', id: args.id as string }),
      },
    },
    optimistic: {
      /** Show the new expense in the list instantly; the server result replaces it. */
      createExpense: (args, cache) => {
        const input = args.input as unknown as ExpenseInputArgs;
        const groupId = args.groupId as string;
        const split = computeSplit(input.amount, input.splitMode, input.participants);
        const me = viewerId();
        const myShare = split.ok ? (split.shares.find((s) => s.userId === me)?.amount ?? 0) : 0;
        const payerKey = cache.keyOfEntity({ __typename: 'User', id: input.paidById });
        const currency = (cache.resolve({ __typename: 'Group', id: groupId }, 'currency') as string) ?? 'INR';
        tempIds += 1;
        return {
          __typename: 'Expense',
          id: `optimistic-${tempIds}`,
          description: input.description,
          amount: input.amount,
          currency,
          category: input.category ?? 'OTHER',
          splitMode: input.splitMode,
          date: input.date,
          myShare,
          paidBy: {
            __typename: 'User',
            id: input.paidById,
            name: (payerKey && (cache.resolve(payerKey, 'name') as string)) || '…',
            avatarColor: (payerKey && (cache.resolve(payerKey, 'avatarColor') as string)) || '#94A3B8',
          },
          group: { __typename: 'Group', id: groupId },
        };
      },
      deleteExpense: (args) => args.id as string,
    },
    updates: {
      Mutation: {
        createExpense: (result, args, cache, info) => {
          const groupId = args.groupId as string;
          if (info.optimistic) {
            // Prepend to every cached expense list of this group (any filter).
            const key = cache.keyOfEntity({ __typename: 'Group', id: groupId });
            const expense = result.createExpense as { id: string } | undefined;
            if (!key || !expense) return;
            for (const field of cache.inspectFields(key)) {
              if (field.fieldName !== 'expenses' || field.arguments?.after) continue;
              const connection = cache.resolve(key, field.fieldKey) as string | null;
              if (!connection) continue;
              const edges = (cache.resolve(connection, 'edges') as string[] | null) ?? [];
              const node = cache.keyOfEntity(expense as never);
              const edgeKey = `${connection}.optimistic-edge`;
              cache.link(edgeKey as never, 'node', node);
              cache.link(connection, 'edges', [edgeKey, ...edges] as never);
            }
            return;
          }
          invalidateGroupMoney(cache, groupId);
        },
        updateExpense: (result, _args, cache) => {
          const expense = result.updateExpense as { group?: { id: string } } | undefined;
          invalidateGroupMoney(cache, expense?.group?.id);
        },
        deleteExpense: (_result, args, cache, info) => {
          const expenseKey = cache.keyOfEntity({ __typename: 'Expense', id: args.id as string });
          const groupKey = expenseKey ? (cache.resolve(expenseKey, 'group') as string | null) : null;
          const groupId = groupKey ? (cache.resolve(groupKey, 'id') as string) : null;
          if (groupKey) {
            // Remove the row from every cached list right away.
            for (const field of cache.inspectFields(groupKey)) {
              if (field.fieldName !== 'expenses') continue;
              const connection = cache.resolve(groupKey, field.fieldKey) as string | null;
              if (!connection) continue;
              const edges = (cache.resolve(connection, 'edges') as string[] | null) ?? [];
              cache.link(
                connection,
                'edges',
                edges.filter((edge) => cache.resolve(edge, 'node') !== expenseKey) as never,
              );
            }
          }
          if (!info.optimistic) {
            if (expenseKey) cache.invalidate(expenseKey);
            invalidateGroupMoney(cache, groupId);
          }
        },
        settleUp: (_result, args, cache) => invalidateGroupMoney(cache, args.groupId as string),
        createGroup: (_result, _args, cache) => invalidateGroupMoney(cache, null),
        joinGroup: (_result, _args, cache) => invalidateGroupMoney(cache, null),
      },
      Subscription: {
        activityAdded: (result, _args, cache) => {
          const activity = result.activityAdded as { group?: { id: string } } | undefined;
          invalidateGroupMoney(cache, activity?.group?.id);
        },
      },
    },
  };
  // Persisted, offline-capable cache where storage exists (IndexedDB / AsyncStorage); in-memory otherwise.
  const storage = createCacheStorage();
  const cache = storage ? offlineExchange({ ...cacheOptions, storage }) : cacheExchange(cacheOptions);

  return new Client({
    url: API_URL,
    requestPolicy: 'cache-and-network',
    preferGetMethod: false,
    exchanges: [
      cache,
      authExchange(async (utils) => ({
        addAuthToOperation(operation) {
          const token = auth.getAccessToken();
          return token ? utils.appendHeaders(operation, { Authorization: `Bearer ${token}` }) : operation;
        },
        willAuthError() {
          return auth.getStatus() === 'signedIn' && auth.isAccessTokenExpiring();
        },
        didAuthError(error) {
          return error.graphQLErrors.some((e) => e.extensions?.code === 'UNAUTHENTICATED');
        },
        async refreshAuth() {
          try {
            await auth.refresh();
          } catch (error) {
            if (!(error instanceof SessionExpiredError)) throw error;
          }
        },
      })),
      fetchExchange,
      ...(sse
        ? [
            subscriptionExchange({
              forwardSubscription(request) {
                const input = { ...request, query: request.query ?? '' };
                return {
                  subscribe(sink) {
                    const unsubscribe = sse.subscribe(input, sink as never);
                    return { unsubscribe };
                  },
                };
              },
            }),
          ]
        : []),
    ],
  });
}
