/**
 * Serialise token refreshes. On the web, several tabs share one refresh
 * token; with rotation + reuse detection, two tabs refreshing at once would
 * look like token theft and revoke the session. The Web Locks API makes tabs
 * take turns (each re-reads the latest token inside the lock). Native apps
 * have a single JS context, so an in-memory promise chain is enough.
 */
let chain: Promise<unknown> = Promise.resolve();

interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

export function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as { locks?: LockManagerLike } | undefined)?.locks;
  if (locks?.request) return locks.request('splitease-token-refresh', fn);
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}
