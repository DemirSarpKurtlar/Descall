/**
 * Merge a fresh GET /api/servers/:id payload into a cached server object.
 * Returns `prev` itself when every field in `fresh` already matches, so React
 * state that holds it does not change (and effects depending on it do not
 * re-run). A new object otherwise.
 */
function sameValue(a, b) {
  if (a === b) return true;
  if (a == null || b == null || typeof a !== "object" || typeof b !== "object") return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function mergeServerDetail(prev, fresh) {
  if (!fresh || typeof fresh !== "object") return prev;
  if (!prev || typeof prev !== "object") return { ...fresh };
  for (const key of Object.keys(fresh)) {
    if (!sameValue(prev[key], fresh[key])) return { ...prev, ...fresh };
  }
  return prev;
}
