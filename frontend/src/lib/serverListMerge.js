/**
 * Server list refresh vs. a join that happened while the request was in flight.
 *
 * GET /api/servers/my replaces the whole list. A request that started before the user
 * joined a server (e.g. the boot fetch racing an invite that is redeemed right after
 * login) answers without that server; replacing the list then dropped it, and the route
 * guard ("server not in my list") sent the user from the new server to /servers.
 *
 * Servers joined locally at or after the request started are kept when the response
 * does not have them. A server joined before the request started is not kept: the
 * response is newer than the join, so its absence means the user left or was removed.
 */

/** How long a local join is remembered (ms). Longer than any list request. */
export const LOCAL_JOIN_TTL_MS = 2 * 60 * 1000;

export function rememberLocalJoin(joins, serverId, now = Date.now()) {
  if (!joins || !serverId) return;
  joins.set(String(serverId), now);
}

/**
 * @param {Array} fresh   servers from the response
 * @param {Array} prev    servers currently in state
 * @param {Map}   joins   serverId -> time it was joined locally
 * @param {number} startedAt  when the list request started
 */
export function mergeFetchedServers(fresh, prev, joins, startedAt, now = Date.now()) {
  const list = Array.isArray(fresh) ? fresh.slice() : [];
  if (joins && joins.size) {
    for (const [id, at] of joins) if (now - at > LOCAL_JOIN_TTL_MS) joins.delete(id);
  }
  if (!joins || !joins.size || !Array.isArray(prev)) return list;
  const have = new Set(list.map((s) => String(s?.id)));
  for (const server of prev) {
    const id = String(server?.id);
    const joinedAt = joins.get(id);
    if (!have.has(id) && joinedAt != null && joinedAt >= startedAt) {
      list.push(server);
      have.add(id);
    }
  }
  return list;
}
