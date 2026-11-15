/**
 * What a channel permission editor shows (server audit P5 / P8).
 *
 * GET .../channels/:id/overrides answers { overrides, synced, parentId, inherited }:
 * a channel with no rules of its own follows its category ("synced"), and `inherited`
 * holds the category's rules. The editors used to show only the channel's own rows, so
 * a synced child of a private category read "everyone inherits / not private".
 *
 * Older backends send no `synced`: the category's rules are then read with a second
 * request (fetchParent), when the channel has a category.
 */

/**
 * @param {object} res        GET overrides response
 * @param {{ parentId?: string|null, isCategory?: boolean, fetchParent?: (id: string) => Promise<object> }} ctx
 * @returns {Promise<{ rows: object[], own: object[], synced: boolean, parentId: string|null }>}
 *   rows: what to display (the category's rules, each marked `inherited: true`, when synced)
 */
export async function overridesView(res, { parentId = null, isCategory = false, fetchParent } = {}) {
  const own = Array.isArray(res?.overrides) ? res.overrides : [];
  if (isCategory) return { rows: own, own, synced: false, parentId: null };
  const mark = (list) => (list || []).map((o) => ({ ...o, inherited: true }));
  if (typeof res?.synced === "boolean") {
    const pid = res.parentId || parentId || null;
    if (!res.synced || !pid) return { rows: own, own, synced: false, parentId: pid };
    return { rows: mark(res.inherited), own, synced: true, parentId: pid };
  }
  if (own.length || !parentId || typeof fetchParent !== "function") {
    return { rows: own, own, synced: false, parentId };
  }
  try {
    const parent = await fetchParent(parentId);
    return { rows: mark(parent?.overrides), own, synced: true, parentId };
  } catch {
    return { rows: own, own, synced: false, parentId };
  }
}

/**
 * Moving a channel with rules of its own into a category with rules: the user chooses
 * between syncing with the category and keeping its own rules (P8). Reads both rule
 * sets; false when either read fails (the server still answers needsSyncChoice).
 */
export async function moveNeedsSyncChoice({ channel, newParentId, getOverrides }) {
  if (!channel?.id || !newParentId || channel.type === "category") return false;
  if (String(channel.parentId || "") === String(newParentId)) return false;
  try {
    const [mine, target] = await Promise.all([getOverrides(channel.id), getOverrides(newParentId)]);
    return Boolean((mine?.overrides || []).length && (target?.overrides || []).length);
  } catch {
    return false;
  }
}
