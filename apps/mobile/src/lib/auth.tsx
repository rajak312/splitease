import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Provider as UrqlProvider, type Client } from 'urql';

import { authManager, type AuthStatus, type SessionPayload } from './auth-manager';
import { clearCacheStorage } from './cache-storage';
import { createUrqlClient } from './urql';

interface AuthContextValue {
  status: AuthStatus;
  userId: string | null;
  signIn: (session: SessionPayload & { user: { id: string } }) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const USER_KEY = 'splitease.userId';

function readStoredUserId(): string | null {
  try {
    return globalThis.localStorage?.getItem?.(USER_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeStoredUserId(id: string | null) {
  try {
    if (id) globalThis.localStorage?.setItem?.(USER_KEY, id);
    else globalThis.localStorage?.removeItem?.(USER_KEY);
  } catch {
    // storage unavailable
  }
}

/** Mutable holder read by graphcache's optimistic resolvers (outside React). */
function createViewerStore(initial: string | null) {
  let id = initial;
  return { get: () => id, set: (next: string | null) => void (id = next) };
}

/**
 * Restores the session on launch and owns the urql client. A fresh client
 * (and an emptied offline cache) is created whenever the user changes, so one
 * account's cached data can never leak into another's.
 */
export function AuthProvider({
  children,
  manager = authManager,
}: {
  children: ReactNode;
  manager?: typeof authManager;
}) {
  const [status, setStatus] = useState<AuthStatus>(() => manager.getStatus());
  const [storedUserId, setUserId] = useState<string | null>(readStoredUserId);
  const [viewer] = useState(() => createViewerStore(storedUserId));
  const [client, setClient] = useState<Client>(() => createUrqlClient(manager, viewer.get));

  useEffect(() => {
    const unsubscribe = manager.subscribe((next) => {
      if (next === 'signedOut') viewer.set(null);
      setStatus(next);
    });
    void manager.restore();
    return unsubscribe;
  }, [manager, viewer]);

  const userId = status === 'signedOut' ? null : storedUserId;

  const signIn = useCallback(
    async (session: SessionPayload & { user: { id: string } }) => {
      if (viewer.get() !== session.user.id) {
        await clearCacheStorage().catch(() => undefined);
        setClient(createUrqlClient(manager, viewer.get));
      }
      viewer.set(session.user.id);
      setUserId(session.user.id);
      writeStoredUserId(session.user.id);
      await manager.setSession(session);
    },
    [manager, viewer],
  );

  const signOut = useCallback(async () => {
    await manager.signOut();
    await clearCacheStorage().catch(() => undefined);
    writeStoredUserId(null);
    viewer.set(null);
    setUserId(null);
    setClient(createUrqlClient(manager, viewer.get));
  }, [manager, viewer]);

  const value = useMemo(() => ({ status, userId, signIn, signOut }), [status, userId, signIn, signOut]);

  return (
    <AuthContext.Provider value={value}>
      <UrqlProvider value={client}>{children}</UrqlProvider>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
