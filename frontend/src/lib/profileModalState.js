/** Profile modal view: never paint a profile that belongs to someone else. */

export function sameUserId(a, b) {
  if (a == null || b == null || a === "" || b === "") return false;
  return String(a) === String(b);
}

export function profileBelongsTo(profile, userId) {
  if (!profile || typeof profile !== "object") return false;
  const id = profile.id ?? profile.userId ?? profile.user_id;
  return sameUserId(id, userId);
}

/** Name and avatar we already had for the person who was just opened. */
export function seedProfile({ userId, username, displayName, avatarUrl, createdAt } = {}) {
  if (userId == null || userId === "") return null;
  const name = displayName || null;
  const avatar = avatarUrl || null;
  return {
    id: userId,
    username: username || null,
    displayName: name,
    display_name: name,
    avatarUrl: avatar,
    avatar_url: avatar,
    createdAt: createdAt || null,
    created_at: createdAt || null,
  };
}

/**
 * Fetched profile wins only when it is the requested user.
 * Otherwise the seed (clicked row) is shown. A previous user's record is dropped.
 */
export function visibleProfile(fetched, userId, seed) {
  if (profileBelongsTo(fetched, userId)) return fetched;
  if (seed && profileBelongsTo(seed, userId)) return seed;
  return null;
}

/** Ignore a response unless it is the user this request asked for. */
export function acceptProfilePayload(requestedId, user) {
  if (!user || typeof user !== "object") return null;
  const id = user.id ?? user.userId ?? user.user_id;
  if (id == null || id === "") return { ...user, id: requestedId };
  if (!sameUserId(id, requestedId)) return null;
  return { ...user, id };
}

export function friendStateFor(userId, friends, override) {
  if (override && sameUserId(override.userId, userId) && override.state) return override.state;
  const list = Array.isArray(friends) ? friends : [];
  return list.some((friend) => friend && sameUserId(friend.id, userId)) ? "friend" : "none";
}

/** First member-since date that belongs to userId. Other people's dates are skipped. */
export function memberSinceIso(userId, sources) {
  for (const src of sources || []) {
    if (!src || typeof src !== "object") continue;
    const id = src.id ?? src.userId ?? src.user_id;
    if (id == null || !sameUserId(id, userId)) continue;
    const iso = src.createdAt || src.created_at;
    if (iso) return iso;
  }
  return null;
}

export function ownedList(ownerId, userId, list) {
  return sameUserId(ownerId, userId) && Array.isArray(list) ? list : [];
}

export function ownedValue(ownerId, userId, value) {
  return sameUserId(ownerId, userId) ? value : null;
}
