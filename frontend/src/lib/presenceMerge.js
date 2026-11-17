/**
 * Friend activity after a REST hydrate (polish world-social-08).
 *
 * The old merge `{ ...snapshot, ...prev }` let every live entry win over the fresh
 * snapshot, so an `activity:friend:clear` missed while offline (sleep, Wi-Fi drop)
 * left "playing X" on screen until a full reload, and removed friends stayed too.
 * Now the snapshot is the truth, except for live updates / clears that arrived after
 * the hydrate started; ids that are no longer friends are dropped.
 */

/**
 * @param {Record<string, object>} prev       current state (live entries carry receivedAt)
 * @param {Record<string, object>} snapshot   REST result by friend id
 * @param {{ friendIds: Iterable<string>, since: number, clearedAt?: Record<string, number> }} opts
 */
export function mergePresenceSnapshot(prev, snapshot, { friendIds, since, clearedAt = {} } = {}) {
  const ids = new Set([...(friendIds || [])].map(String));
  const out = {};
  for (const [id, entry] of Object.entries(snapshot || {})) {
    if (!ids.has(String(id))) continue;
    if ((clearedAt[id] || 0) > since) continue;
    out[id] = entry;
  }
  for (const [id, entry] of Object.entries(prev || {})) {
    if (!ids.has(String(id))) continue;
    if ((entry?.receivedAt || 0) > since) out[id] = entry;
  }
  return out;
}

/** Drop entries for ids that are no longer friends; same object when nothing changes. */
export function prunePresence(prev, friendIds) {
  const ids = new Set([...(friendIds || [])].map(String));
  let changed = false;
  const out = {};
  for (const [id, entry] of Object.entries(prev || {})) {
    if (ids.has(String(id))) out[id] = entry;
    else changed = true;
  }
  return changed ? out : prev;
}
