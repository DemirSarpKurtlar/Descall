/**
 * A pulled refresh applies the REST friend list (database truth) over the
 * socket-fed one without losing what only the socket knows.
 *
 * - Membership comes from REST: new friendships appear, removed ones go.
 * - Profile fields come from REST when it has a value.
 * - Live fields (presence status, activity, last message) stay from the
 *   existing entry; REST does not carry them, and a null from REST must not
 *   blank them.
 *
 * Order follows the existing list, new friends first (the list sorts itself
 * later; this keeps rows from jumping when nothing changed).
 */
export function mergeRestFriends(prev, rest) {
  const before = Array.isArray(prev) ? prev : [];
  const incoming = (Array.isArray(rest) ? rest : []).filter((u) => u && u.id != null);
  const restById = new Map(incoming.map((u) => [String(u.id), u]));
  const prevById = new Map(before.filter((u) => u && u.id != null).map((u) => [String(u.id), u]));

  const overlay = (old, fresh) => {
    const out = { ...old };
    for (const [k, v] of Object.entries(fresh)) {
      if (v !== null && v !== undefined) out[k] = v;
      else if (!(k in out)) out[k] = v;
    }
    return out;
  };

  const added = incoming.filter((u) => !prevById.has(String(u.id)));
  const kept = before
    .filter((u) => u && restById.has(String(u.id)))
    .map((u) => overlay(u, restById.get(String(u.id))));
  const next = [...added, ...kept];

  const same =
    next.length === before.length &&
    next.every((u, i) => {
      const o = before[i];
      if (!o || String(o.id) !== String(u.id)) return false;
      const keys = new Set([...Object.keys(o), ...Object.keys(u)]);
      for (const k of keys) if (o[k] !== u[k]) return false;
      return true;
    });
  return same ? before : next;
}
