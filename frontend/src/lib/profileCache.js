/**
 * Shared cache for public user profiles (GET /auth/users/:id), used by the profile
 * window (UserProfileModal) and the hover card (UserHoverCard).
 *
 * Owner report (Nov 2026): a profile first opened with the plain default look (default
 * banner, no theme, no flag, no bio) and only then switched to the real one. The window
 * rendered before the profile arrived. Now:
 *   - a profile fetched once (hover card, earlier open) is shown at once from here and
 *     refreshed in the background (stale-while-revalidate);
 *   - concurrent requests for the same user share one fetch;
 *   - `user:profile:updated` / own `user:updated` drop the entry (App.jsx), so a changed
 *     look is never shown stale;
 *   - the window keeps its content hidden until the first profile is known
 *     (`is-look-pending` in UserProfileModal), instead of painting the wrong look.
 */

const MAX_ENTRIES = 300;
/** After this, a cached profile is still shown but always refreshed. */
export const PROFILE_FRESH_MS = 60_000;

const cache = new Map(); // id -> { user, at }
const inflight = new Map(); // id -> Promise<user|null>

const keyOf = (id) => (id == null ? "" : String(id));

function remember(key, user) {
  if (!key || !user) return;
  cache.delete(key);
  cache.set(key, { user, at: Date.now() });
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
}

/** Cached profile (any age) or null. */
export function peekProfile(id) {
  const hit = cache.get(keyOf(id));
  return hit ? hit.user : null;
}

/** True when the cached profile is younger than PROFILE_FRESH_MS. */
export function isProfileFresh(id, now = Date.now()) {
  const hit = cache.get(keyOf(id));
  return Boolean(hit && now - hit.at < PROFILE_FRESH_MS);
}

export function storeProfile(id, user) {
  remember(keyOf(id), user);
}

// Other caches of the same profile (the hover card's, lib/hoverProfile.js) follow every drop:
// a changed look must never stay on screen there either.
const dropListeners = new Set();
/** fn(id) on invalidateProfile, fn(null) on clearProfileCache. Returns an unsubscribe. */
export function onProfileDropped(fn) {
  dropListeners.add(fn);
  return () => dropListeners.delete(fn);
}
function notifyDrop(id) {
  for (const fn of dropListeners) {
    try { fn(id); } catch { /* a listener never breaks the cache */ }
  }
}

export function invalidateProfile(id) {
  const key = keyOf(id);
  cache.delete(key);
  inflight.delete(key);
  notifyDrop(key);
}

export function clearProfileCache() {
  cache.clear();
  inflight.clear();
  notifyDrop(null);
}

/**
 * Fetch (or join the running fetch of) a profile. `load(id)` does the request and returns the
 * accepted user or null; it is injected so tests and both callers share one code path.
 */
export function fetchProfileShared(id, load) {
  const key = keyOf(id);
  if (!key || typeof load !== "function") return Promise.resolve(null);
  const running = inflight.get(key);
  if (running) return running;
  const p = Promise.resolve()
    .then(() => load(id))
    .then((user) => {
      if (inflight.get(key) === p && user) remember(key, user);
      return user || null;
    })
    .finally(() => {
      if (inflight.get(key) === p) inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}
