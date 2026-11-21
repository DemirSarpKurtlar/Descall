/**
 * Cold-start requests started by main.jsx while the App chunk still downloads
 * and parses (api/bootPrefetch.js): GET /auth/me, /api/friends/list and
 * /api/dm/previews. The API functions take the in-flight promise instead of
 * sending a second request.
 *
 * One-shot per key: the first caller with the same token gets the promise,
 * every later call (refresh, reconnect) sends a real request. An entry that
 * nobody took within TTL_MS, or one for another token (sign-out, account
 * switch), is dropped, so stale boot data is never served.
 *
 * Dependency-free (tests: bootPrefetch.selftest.mjs).
 */

export const BOOT_PREFETCH_TTL_MS = 20_000;

const entries = new Map();

export function putBootPrefetch(key, token, promise, now = Date.now()) {
  if (!key || !token || !promise || typeof promise.then !== "function") return;
  // An unclaimed rejection must not surface as an unhandled rejection.
  promise.catch(() => {});
  entries.set(key, { token, promise, at: now });
}

export function takeBootPrefetch(key, token, now = Date.now()) {
  const entry = entries.get(key);
  if (!entry) return null;
  entries.delete(key);
  if (!token || entry.token !== token) return null;
  if (now - entry.at > BOOT_PREFETCH_TTL_MS) return null;
  return entry.promise;
}

/**
 * Use the boot request when there is one; if it failed without an HTTP answer
 * (network, timeout), send a fresh request so the caller sees the same outcome
 * as before. An HTTP error (401, 403, 5xx) is passed on as it is.
 */
export function bootPrefetchOr(key, token, fresh) {
  const pending = takeBootPrefetch(key, token);
  if (!pending) return fresh();
  return pending.catch((err) => {
    if (err && (err.status || err.causeStatus)) throw err;
    return fresh();
  });
}

export function clearBootPrefetch() {
  entries.clear();
}
