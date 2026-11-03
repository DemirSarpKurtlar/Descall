/**
 * Optimistic moderation updates (3.7.32).
 *
 * Kick / ban / timeout used to wait for the server and, on some paths, kept the
 * old member row until the list was refetched. These helpers update the list at
 * once and give back an exact undo for when the request fails.
 */
const same = (a, b) => String(a) === String(b);

/** Remove a member. Returns { next, undo } where undo(list) puts it back at its old index. */
export function removeMemberOptimistic(list, userId) {
  const arr = Array.isArray(list) ? list : [];
  const index = arr.findIndex((m) => same(m?.userId, userId));
  if (index < 0) return { next: arr, undo: (l) => l };
  const removed = arr[index];
  const next = arr.slice(0, index).concat(arr.slice(index + 1));
  const undo = (current) => {
    const cur = Array.isArray(current) ? current : [];
    if (cur.some((m) => same(m?.userId, userId))) return cur;
    const at = Math.min(index, cur.length);
    return cur.slice(0, at).concat([removed], cur.slice(at));
  };
  return { next, undo };
}

/** Patch a member. undo(list) restores only the patched fields, leaving later changes alone. */
export function patchMemberOptimistic(list, userId, patch) {
  const arr = Array.isArray(list) ? list : [];
  const before = arr.find((m) => same(m?.userId, userId));
  if (!before) return { next: arr, undo: (l) => l };
  const keys = Object.keys(patch || {});
  const prev = {};
  for (const k of keys) prev[k] = before[k];
  const next = arr.map((m) => (same(m?.userId, userId) ? { ...m, ...patch } : m));
  const undo = (current) =>
    (Array.isArray(current) ? current : []).map((m) => (same(m?.userId, userId) ? { ...m, ...prev } : m));
  return { next, undo };
}

/**
 * Apply now, send, roll back on failure.
 * update(fn) must apply fn to the current list (e.g. setMembers).
 * Returns { ok, result, error }.
 */
export async function runOptimistic({ update, change, request, onError }) {
  let undo = null;
  update((list) => {
    const r = change(list);
    undo = r.undo;
    return r.next;
  });
  try {
    const result = await request();
    return { ok: true, result };
  } catch (error) {
    if (undo) update((list) => undo(list));
    onError?.(error);
    return { ok: false, error };
  }
}
