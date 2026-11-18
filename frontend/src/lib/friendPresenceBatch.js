/**
 * Friends' live activity in one request (POST /api/activity/presence/batch).
 *
 * The app used to send one GET /api/activity/friend/:id/presence per friend, all at
 * once, at boot and on every socket (re)connect: 150 friends = 150 requests. An older
 * backend without the batch route (404 / 405) still gets the per-friend calls, at most
 * PER_FRIEND_CONCURRENCY at a time.
 *
 * Resolves to { [friendId]: presenceRow | null }.
 */

export const PER_FRIEND_CONCURRENCY = 6;

async function perFriend(ids, { base, token, fetchImpl }) {
  const out = {};
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++];
      try {
        const res = await fetchImpl(`${base}/api/activity/friend/${encodeURIComponent(id)}/presence`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = res.ok ? await res.json() : null;
        out[id] = body?.presence || null;
      } catch {
        out[id] = null;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PER_FRIEND_CONCURRENCY, ids.length) }, worker));
  return out;
}

export async function fetchFriendPresence(ids, { base = "", token, fetchImpl = fetch } = {}) {
  const list = [...new Set((ids || []).filter(Boolean).map(String))];
  if (!list.length || !token) return {};
  try {
    const res = await fetchImpl(`${base}/api/activity/presence/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids: list }),
    });
    if (res.status === 404 || res.status === 405) return perFriend(list, { base, token, fetchImpl });
    if (!res.ok) return {};
    const body = await res.json();
    return body && typeof body.presence === "object" && body.presence ? body.presence : {};
  } catch {
    return {};
  }
}

/**
 * One hydrate at a time, and none again within `minGapMs` of the last one (boot fires it
 * from both the friends list and the socket connect; a reconnect right after a hydrate
 * adds nothing, live socket events keep presence current). `run` may return false when it
 * had nothing to do; that does not start the gap.
 */
export function createPresenceHydrator(run, { minGapMs = 15_000, now = () => Date.now() } = {}) {
  let inFlight = null;
  let lastAt = -Infinity;
  return function hydrate({ force = false } = {}) {
    if (inFlight) return inFlight;
    if (!force && now() - lastAt < minGapMs) return Promise.resolve(false);
    inFlight = Promise.resolve()
      .then(run)
      .then((ran) => {
        // run() returns false when it had nothing to do (no friends yet): no gap then.
        if (ran === false) return false;
        lastAt = now();
        return true;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };
}
