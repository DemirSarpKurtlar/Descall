/**
 * Render the signed-in app straight from the cached session (2.10.108).
 *
 * Before, every launch showed the boot skeleton until GET /auth/me answered.
 * On a phone that is one Render round trip at best and, on a weak or waking
 * connection, the whole transport-retry budget (up to ~15 s). The cached user
 * (descall_user) and token are enough to paint chats, calls and settings at
 * once; /auth/me still runs in the background and a 401/403 signs out.
 */
export function optimisticSessionReady({ token, cachedUser } = {}) {
  if (!token || typeof token !== "string") return false;
  const id = cachedUser?.id;
  return id != null && String(id).length > 0;
}
