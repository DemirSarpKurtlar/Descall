// Typing flare shown above the composer (shop category typing_flare): the flare of the person
// who is TYPING, so a bought flare is what others see while you type. Until Nov 2026 the bar
// wore the viewer's own flare, so nobody ever saw anyone else's.
// The server's typing:update carries only { id, username }; cosmetics come from what the
// client already knows: the open DM peer, then the friends list. Unknown -> default dots.

const keyOf = (u) => {
  const k = u?.equippedTypingFlare?.effect_key || u?.equippedTypingFlare?.effectKey;
  return typeof k === "string" && k ? k : null;
};

/**
 * @param {{ typers?: object[], activeDmUser?: object|null, friends?: object[] }} ctx
 *   typers = users typing in the open conversation (first one leads the bar).
 * @returns {string|null} effect key
 */
export function typingFlareKey({ typers = [], activeDmUser = null, friends = [] } = {}) {
  const first = (Array.isArray(typers) ? typers : []).find((u) => u && u.id != null);
  if (!first) return null;
  const same = (u) => u && String(u.id) === String(first.id);
  if (keyOf(first)) return keyOf(first);
  if (same(activeDmUser) && keyOf(activeDmUser)) return keyOf(activeDmUser);
  const friend = Array.isArray(friends) ? friends.find(same) : null;
  return keyOf(friend);
}
