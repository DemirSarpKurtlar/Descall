import { avatarEffectGeometry } from "./avatarEffectGeometry.js";
/**
 * Settings profile header, "Banner Kart" (3.7.x, owner pick 01): pure model so
 * the card, its tests and the mockups agree on what is shown.
 */

const STATUS_KEYS = new Set(["online", "idle", "away", "dnd", "busy"]);

/** Same seeded fallback as the hover card, so a user without a banner looks the same everywhere. */
export function fallbackBanner(seed) {
  const hues = [220, 260, 280, 200, 340, 180, 30];
  let h = 0;
  for (const ch of String(seed || "user")) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const hue = hues[Math.abs(h) % hues.length];
  return `linear-gradient(135deg, hsl(${hue}, 65%, 30%) 0%, hsl(${(hue + 40) % 360}, 55%, 18%) 100%)`;
}

export function bannerUrlOf(user) {
  if (!user) return null;
  return user.equippedBanner?.asset_url || user.bannerUrl || user.banner_url || null;
}

/** Status dot to paint: invisible and offline paint nothing (you look offline to others). */
export function statusDotOf(status) {
  const s = String(status || "online");
  return STATUS_KEYS.has(s) ? s : null;
}

/**
 * Avatar effects (`.cosmetic-avatar-effect`) extend `avatarEffectGeometry().outset` past the avatar.
 * The old hero gave the avatar only 6 px above it inside a scrolling column, so
 * the ring's top was cut off and read as a stray blue arc. The card reserves the
 * full ring plus its glow.
 */
export function effectRoom(avatarSize) {
  const n = Math.max(0, Number(avatarSize) || 0);
  return avatarEffectGeometry(n).outset + 6;
}

export function profileCardModel(me, { status, isAdmin = false, teamLabel = "", fallbackName = "User" } = {}) {
  const username = String(me?.username || "").trim();
  const display = String(me?.displayName || me?.display_name || "").trim() || username || fallbackName;
  const handle = `@${(username || "user").toLowerCase()}`;
  const bannerUrl = bannerUrlOf(me);
  return {
    display,
    handle,
    meta: isAdmin && teamLabel ? `${handle} · ${teamLabel}` : handle,
    bannerUrl,
    bannerFallback: bannerUrl ? null : fallbackBanner(username || display),
    status: statusDotOf(status),
  };
}
