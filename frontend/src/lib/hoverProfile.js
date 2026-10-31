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

/** "12 dk", "1 sa 5 dk", "3 gün" since an ISO time; "" when unknown. Turkish, compact. */
export function sinceLabel(iso, now = Date.now(), lang = "tr") {
  const t = new Date(iso).getTime();
  if (!iso || !Number.isFinite(t) || now < t) return "";
  const min = Math.floor((now - t) / 60000);
  const en = lang === "en";
  if (min < 1) return en ? "just now" : "az önce";
  if (min < 60) return en ? `${min} min` : `${min} dk`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? (en ? `${h} h ${min % 60} min` : `${h} sa ${min % 60} dk`) : (en ? `${h} h` : `${h} sa`);
  const d = Math.floor(h / 24);
  return en ? `${d} d` : `${d} gün`;
}

/**
 * What the person is doing right now, for the "Şu an" section.
 * Voice channel first (we can see it only for servers we are subscribed to),
 * then the shared app / game activity (friends only, privacy-gated on the
 * server). Returns null when nothing is known.
 */
export function currentActivity(userId, { friendPresence, voiceStatesByServer, servers } = {}, now = Date.now(), lang = "tr") {
  if (userId == null) return null;
  const id = String(userId);
  const byServer = voiceStatesByServer && typeof voiceStatesByServer === "object" ? voiceStatesByServer : {};
  for (const [serverId, channels] of Object.entries(byServer)) {
    for (const [channelId, state] of Object.entries(channels || {})) {
      const members = Array.isArray(state?.members) ? state.members : [];
      if (!members.some((m) => m && String(m.id) === id)) continue;
      const server = (servers || []).find((s) => s && String(s.id) === String(serverId)) || null;
      const channel = (server?.channels || []).find((c) => c && String(c.id) === String(channelId)) || null;
      return {
        kind: "voice",
        title: channel?.name || (lang === "en" ? "Voice channel" : "Ses kanalı"),
        subtitle: server?.name || "",
        count: state.memberCount ?? members.length,
        iconUrl: server?.iconUrl || server?.icon_url || null,
        initial: String(server?.name || "S").trim().charAt(0).toLocaleUpperCase("tr") || "S",
      };
    }
  }
  const p = friendPresence && typeof friendPresence === "object" ? friendPresence[id] : null;
  if (p && (p.displayName || p.appName)) {
    return {
      kind: p.isManual ? "status" : p.appType === "game" ? "game" : "app",
      title: p.displayName || p.appName,
      subtitle: sinceLabel(p.startedAt, now, lang),
      count: null,
      iconUrl: null,
      initial: String(p.appName || p.displayName || "A").trim().charAt(0).toLocaleUpperCase("tr") || "A",
    };
  }
  return null;
}

const mutualCache = new Map(); // username -> { at, data }
const mutualInflight = new Map();

/** Mutual friends + servers, cached for a minute like the profile. */
export function loadMutual(username, fetchMutual, now = Date.now()) {
  const key = String(username || "").toLowerCase();
  if (!key) return Promise.resolve(null);
  const hit = mutualCache.get(key);
  if (hit && now - hit.at < TTL_MS) return Promise.resolve(hit.data);
  if (mutualInflight.has(key)) return mutualInflight.get(key);
  const p = Promise.resolve()
    .then(() => fetchMutual(username))
    .then((data) => {
      const clean = data && typeof data === "object"
        ? {
            friends: Array.isArray(data.mutualFriends) ? data.mutualFriends : [],
            servers: Array.isArray(data.mutualServers) ? data.mutualServers : [],
          }
        : null;
      if (clean) mutualCache.set(key, { at: Date.now(), data: clean });
      return clean;
    })
    .catch(() => null)
    .finally(() => mutualInflight.delete(key));
  mutualInflight.set(key, p);
  return p;
}

export function cachedMutual(username, now = Date.now()) {
  const hit = mutualCache.get(String(username || "").toLowerCase());
  return hit && now - hit.at < TTL_MS ? hit.data : null;
}

/** Hover-intent timings: leave the trigger → close after GRACE unless the pointer reaches the card. */
export const HOVER_CLOSE_GRACE_MS = 260;
