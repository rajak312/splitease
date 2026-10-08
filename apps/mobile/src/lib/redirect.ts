/**
 * Where to go after signing in — e.g. an invite link opened while signed out.
 * The auth routes redirect to `peek()` once the session exists; the target
 * screen calls `clear()` when it mounts.
 */
let pending: string | null = null;

export const pendingRedirect = {
  set(path: string) {
    pending = path;
  },
  peek(): string | null {
    return pending;
  },
  clear() {
    pending = null;
  },
};
