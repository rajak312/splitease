import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = 4600;

/**
 * GraphQL endpoint resolution:
 * 1. EXPO_PUBLIC_API_URL (set on Vercel / CI, or in apps/mobile/.env)
 * 2. In development on a device (Expo Go), the dev machine's LAN IP taken from
 *    the Metro host URI — so a phone on the same Wi-Fi reaches the local API
 * 3. http://localhost:4600/graphql
 */
export function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;
  if (Platform.OS !== 'web') {
    const host = Constants.expoConfig?.hostUri?.split(':')[0];
    if (host) return `http://${host}:${API_PORT}/graphql`;
  }
  return `http://localhost:${API_PORT}/graphql`;
}

export const API_URL = resolveApiUrl();

/**
 * Realtime transport. "sse" uses GraphQL subscriptions over Server-Sent
 * Events (works against the long-running local API). "poll" refetches active
 * screens on an interval — used on Vercel, where serverless instances do not
 * share an in-memory pub/sub. Both modes also refetch on focus.
 */
export const REALTIME_MODE: 'sse' | 'poll' =
  process.env.EXPO_PUBLIC_REALTIME === 'poll' || (!process.env.EXPO_PUBLIC_REALTIME && API_URL.startsWith('https://'))
    ? 'poll'
    : 'sse';

export const POLL_INTERVAL_MS = 15_000;

export const WEB_APP_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://splitease-lalit.vercel.app';

export const GITHUB_URL = 'https://github.com/lalitkumarrajak/splitease';
