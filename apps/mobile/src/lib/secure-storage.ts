/**
 * Web implementation. Browsers have no OS keychain; the refresh token lives in
 * localStorage and the access token only in memory. Trade-off (see README):
 * an XSS bug could read localStorage, so the refresh token is opaque, rotated
 * on every use with reuse detection, and revocable. An httpOnly cookie would
 * be stronger but the web app and API live on different vercel.app
 * subdomains, which browsers treat as cross-site (third-party cookies).
 */
export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // storage disabled (private mode) — session lasts for this tab only
    }
  },
  async deleteItem(key: string): Promise<void> {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // ignore
    }
  },
};
