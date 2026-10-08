import { API_URL } from './config';
import { withRefreshLock } from './lock';
import { secureStorage } from './secure-storage';

const REFRESH_KEY = 'splitease.refreshToken';
/** Refresh a little before the access token actually expires. */
const EXPIRY_SKEW_MS = 30_000;

export interface SessionPayload {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
}

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

type Listener = (status: AuthStatus) => void;

const REFRESH_MUTATION = `mutation Refresh($t: String!) {
  refreshSession(refreshToken: $t) { accessToken accessTokenExpiresAt refreshToken }
}`;
const LOGOUT_MUTATION = `mutation Logout($t: String!) { logout(refreshToken: $t) }`;

export class SessionExpiredError extends Error {
  constructor() {
    super('Session expired');
  }
}

async function postGraphQL<T>(query: string, variables: Record<string, unknown>, fetchImpl: typeof fetch) {
  const response = await fetchImpl(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/graphql-response+json, application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return (await response.json()) as { data?: T | null; errors?: { extensions?: { code?: string } }[] };
}

/**
 * Owns the session outside React so the urql auth exchange and UI share one
 * source of truth.
 *
 * - Access token (JWT, 15 min): memory only.
 * - Refresh token (opaque, 30 days, rotated on every use): SecureStore on
 *   iOS/Android, localStorage on web.
 * - Refreshes are single-flight within the app and serialised across browser
 *   tabs (Web Locks), because reusing a rotated token revokes the session.
 */
export class AuthManager {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;
  private status: AuthStatus = 'loading';
  private listeners = new Set<Listener>();
  private inflight: Promise<string | null> | null = null;

  constructor(private readonly fetchImpl: typeof fetch = (...args) => fetch(...args)) {}

  getStatus() {
    return this.status;
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setStatus(status: AuthStatus) {
    if (this.status === status) return;
    this.status = status;
    for (const l of this.listeners) l(status);
  }

  getAccessToken() {
    return this.accessToken;
  }

  isAccessTokenExpiring(now = Date.now()) {
    return !this.accessToken || this.accessTokenExpiresAt - EXPIRY_SKEW_MS <= now;
  }

  async setSession(session: SessionPayload) {
    this.accessToken = session.accessToken;
    this.accessTokenExpiresAt = new Date(session.accessTokenExpiresAt).getTime();
    await secureStorage.setItem(REFRESH_KEY, session.refreshToken);
    this.setStatus('signedIn');
  }

  /** On app start: exchange a stored refresh token for a fresh session. */
  async restore() {
    const stored = await secureStorage.getItem(REFRESH_KEY);
    if (!stored) {
      this.setStatus('signedOut');
      return;
    }
    try {
      await this.refresh();
    } catch (error) {
      if (error instanceof SessionExpiredError) return;
      // Offline: keep the stored token and show cached data; requests will
      // retry the refresh through the auth exchange when back online.
      this.setStatus('signedIn');
    }
  }

  /** Get a new access token. Throws SessionExpiredError when the user must sign in again. */
  refresh(): Promise<string | null> {
    this.inflight ??= withRefreshLock(async () => {
      const token = await secureStorage.getItem(REFRESH_KEY);
      if (!token) {
        await this.clear();
        throw new SessionExpiredError();
      }
      const result = await postGraphQL<{ refreshSession: SessionPayload }>(
        REFRESH_MUTATION,
        { t: token },
        this.fetchImpl,
      );
      if (result.data?.refreshSession) {
        await this.setSession(result.data.refreshSession);
        return this.accessToken;
      }
      if (result.errors?.some((e) => e.extensions?.code === 'UNAUTHENTICATED')) {
        await this.clear();
        throw new SessionExpiredError();
      }
      throw new Error('Could not refresh session');
    }).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  async signOut() {
    const token = await secureStorage.getItem(REFRESH_KEY);
    if (token) {
      await postGraphQL(LOGOUT_MUTATION, { t: token }, this.fetchImpl).catch(() => undefined);
    }
    await this.clear();
  }

  private async clear() {
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
    await secureStorage.deleteItem(REFRESH_KEY);
    this.setStatus('signedOut');
  }
}

export const authManager = new AuthManager();
