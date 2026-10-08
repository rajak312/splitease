import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useSubscription } from 'urql';

import { ActivityAddedSubscription } from '../graphql/documents';
import { POLL_INTERVAL_MS, REALTIME_MODE } from '../lib/config';

/**
 * Keeps a screen fresh:
 * - SSE mode: a GraphQL subscription; graphcache invalidates the affected
 *   group's balances/expenses when an event arrives, which re-runs queries.
 * - Poll mode (Vercel): network-only refetch every 15 s while focused.
 * - Always: refetch when the screen regains focus or the app returns to the
 *   foreground, plus a `refreshing` flag for pull-to-refresh.
 */
export function useLiveRefresh(
  refetch: () => void,
  options: { groupId?: string | null; enabled?: boolean; subscribe?: boolean } = {},
) {
  const { groupId = null, enabled = true, subscribe = true } = options;
  const [refreshing, setRefreshing] = useState(false);
  const refetchRef = useRef(refetch);
  useLayoutEffect(() => {
    refetchRef.current = refetch;
  });

  useSubscription({
    query: ActivityAddedSubscription,
    variables: { groupId },
    pause: !enabled || !subscribe || REALTIME_MODE !== 'sse',
  });

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      refetchRef.current();
      const timer = REALTIME_MODE === 'poll' ? setInterval(() => refetchRef.current(), POLL_INTERVAL_MS) : null;
      return () => {
        if (timer) clearInterval(timer);
      };
    }, [enabled]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && enabled) refetchRef.current();
    });
    return () => sub.remove();
  }, [enabled]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refetchRef.current();
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  return { refreshing, onRefresh };
}
