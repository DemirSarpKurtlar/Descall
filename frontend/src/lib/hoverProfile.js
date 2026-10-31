/**
 * Full profile for the desktop hover card (3.7.11).
 *
 * The card used to render only the message author object (name, avatar,
 * country), so nothing bought in the shop showed. On hover we load the same
 * public profile the big profile card reads (`GET /auth/users/:id`), cache it
 * for a minute, share one request between hovers and merge it over the base
 * user. Live presence (status, lastSeen) always comes from the base.
 */

import { profileColorClass, profileColorStyle } from "./profileColors.js";

const TTL_MS = 60_000;
const MAX_ENTRIES = 200;
const cache = new Map(); // id -> { at, data }
const inflight = new Map(); // id -> Promise

/** Fields that describe "right now" and must not be overwritten by a cached profile. */
const LIVE_FIELDS = ["status", "lastSeen", "last_seen", "isOnline"];

export function mergeHoverProfile(base, full) {
  if (!base) return full || null;
  if (!full || typeof full !== "object") return base;
  if (base.id != null && full.id != null && String(base.id) !== String(full.id)) return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(full)) {
    if (LIVE_FIELDS.includes(key)) continue;
    if (value === null || value === undefined || value === "") continue;
    out[key] = value;
  }
  return out;
}

export function cachedHoverProfile(userId, now = Date.now()) {
  const hit = cache.get(String(userId));
  return hit && now - hit.at < TTL_MS ? hit.data : null;
}

function remember(id, data, now) {
  cache.set(id, { at: now, data });
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
}

/**
 * Load (or reuse) the public profile. `fetchProfile(id)` resolves to the user
 * object or null; injected so the selftest runs without a network.
 */
export function loadHoverProfile(userId, fetchProfile, now = Date.now()) {
  if (userId == null || userId === "") return Promise.resolve(null);
  const id = String(userId);
  const hit = cachedHoverProfile(id, now);
  if (hit) return Promise.resolve(hit);
  if (inflight.has(id)) return inflight.get(id);
  const p = Promise.resolve()
    .then(() => fetchProfile(id))
    .then((data) => {
      if (data && typeof data === "object") remember(id, data, Date.now());
      return data || null;
    })
    .catch(() => null)
    .finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

export function clearHoverProfileCache() {
  cache.clear();
  inflight.clear();
}

/** Everything the hover card paints, from the merged user. */
export function hoverCardModel(user) {
  if (!user) return null;
  const bannerUrl = user.equippedBanner?.asset_url || user.bannerUrl || user.banner_url || null;
  const backgroundUrl = user.equippedBackground?.asset_url || null;
  const aura = user.equippedProfileAura?.effect_key;
  return {
    bannerUrl,
    backgroundUrl,
    // A profile background image wins over a card colour, same as the big card.
    colorClass: backgroundUrl ? "" : profileColorClass(user),
    colorStyle: backgroundUrl ? null : profileColorStyle(user),
    auraClass: aura ? `cosmetic-profile-aura aura-${aura}` : "",
    createdAt: user.createdAt || user.created_at || null,
    bio: String(user.bio || "").trim(),
    customStatus: String(user.customStatus || user.custom_status || "").trim(),
  };
}
