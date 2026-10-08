import type { StorageAdapter } from '@urql/exchange-graphcache';
import { makeDefaultStorage } from '@urql/exchange-graphcache/default-storage';

/** Web: persist the normalised cache + queued offline mutations in IndexedDB. */
export function createCacheStorage(): StorageAdapter | undefined {
  if (typeof indexedDB === 'undefined') return undefined;
  return makeDefaultStorage({ idbName: 'splitease-cache-v1', maxAge: 7 });
}

export async function clearCacheStorage() {
  if (typeof indexedDB === 'undefined') return;
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('splitease-cache-v1');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}
