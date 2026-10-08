import * as SecureStore from 'expo-secure-store';

import { AuthManager, SessionExpiredError } from '../src/lib/auth-manager';

const session = (n: number) => ({
  accessToken: `access-${n}`,
  accessTokenExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  refreshToken: `refresh-${n}`,
});

function jsonResponse(body: unknown) {
  return Promise.resolve({ json: () => Promise.resolve(body) } as Response);
}

describe('AuthManager', () => {
  it('keeps the access token in memory and the refresh token in SecureStore', async () => {
    const manager = new AuthManager(jest.fn());
    await manager.setSession(session(1));
    expect(manager.getAccessToken()).toBe('access-1');
    expect(manager.getStatus()).toBe('signedIn');
    expect(await SecureStore.getItemAsync('splitease.refreshToken')).toBe('refresh-1');
  });

  it('rotates: refresh stores the new refresh token', async () => {
    const fetchMock = jest.fn(() => jsonResponse({ data: { refreshSession: session(2) } }));
    const manager = new AuthManager(fetchMock as unknown as typeof fetch);
    await manager.setSession(session(1));
    await manager.refresh();
    expect(manager.getAccessToken()).toBe('access-2');
    expect(await SecureStore.getItemAsync('splitease.refreshToken')).toBe('refresh-2');
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body.variables).toEqual({ t: 'refresh-1' });
  });

  it('de-duplicates concurrent refreshes (single flight)', async () => {
    const fetchMock = jest.fn(() => jsonResponse({ data: { refreshSession: session(3) } }));
    const manager = new AuthManager(fetchMock as unknown as typeof fetch);
    await manager.setSession(session(1));
    await Promise.all([manager.refresh(), manager.refresh(), manager.refresh()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('signs out when the server rejects the refresh token', async () => {
    const fetchMock = jest.fn(() =>
      jsonResponse({ errors: [{ message: 'expired', extensions: { code: 'UNAUTHENTICATED' } }] }),
    );
    const manager = new AuthManager(fetchMock as unknown as typeof fetch);
    const statuses: string[] = [];
    manager.subscribe((s) => statuses.push(s));
    await manager.setSession(session(1));
    await expect(manager.refresh()).rejects.toBeInstanceOf(SessionExpiredError);
    expect(manager.getStatus()).toBe('signedOut');
    expect(manager.getAccessToken()).toBeNull();
    expect(await SecureStore.getItemAsync('splitease.refreshToken')).toBeNull();
    expect(statuses).toEqual(['signedIn', 'signedOut']);
  });

  it('stays signed in (offline) when the refresh request fails on the network', async () => {
    const manager = new AuthManager(jest.fn(() => Promise.reject(new TypeError('Network request failed'))) as never);
    await SecureStore.setItemAsync('splitease.refreshToken', 'refresh-1');
    await manager.restore();
    expect(manager.getStatus()).toBe('signedIn');
    expect(await SecureStore.getItemAsync('splitease.refreshToken')).toBe('refresh-1');
  });

  it('restores to signedOut when no token is stored', async () => {
    const manager = new AuthManager(jest.fn());
    await manager.restore();
    expect(manager.getStatus()).toBe('signedOut');
  });

  it('reports when the access token is about to expire', async () => {
    const manager = new AuthManager(jest.fn());
    await manager.setSession({ ...session(1), accessTokenExpiresAt: new Date(Date.now() + 10_000).toISOString() });
    expect(manager.isAccessTokenExpiring()).toBe(true);
    await manager.setSession(session(2));
    expect(manager.isAccessTokenExpiring()).toBe(false);
  });
});
