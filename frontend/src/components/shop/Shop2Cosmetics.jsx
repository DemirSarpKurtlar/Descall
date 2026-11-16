import { API_BASE_URL } from "../../config/api";
import { useLocale } from "../../context/LocaleContext";
import { localizedShopItemName } from "../../lib/shopItemI18n.js";
import { artUrl } from "../../lib/stillArt.js";

/**
 * Market 2.0 avatar frames and profile badges (catalog group C1). Only "s2-" rows render:
 * frames from before 2.10.114 and shop badges from before 2026-10-26 stay removed.
 * The server sends a lean record whose asset_url is a short cacheable path
 * (`/api/shop/assets/:id?v=…`, see backend lib/shop.js leanShop2Cosmetic); every avatar on the
 * page shares the one cached image. Art geometry: frames fill a 132% square around the avatar
 * (`.ui-avatar-frame-overlay`), badges are drawn on a 24 grid for 16-20 px.
 */

export function isShop2Cosmetic(item) {
  return Boolean(item && typeof item.sku === "string" && item.sku.startsWith("s2-") && item.asset_url);
}

/** Absolute image URL for a lean s2 record (native apps load the UI from a custom scheme). */
export function shop2AssetSrc(item) {
  if (!isShop2Cosmetic(item)) return null;
  const url = String(item.asset_url);
  if (/^(data:|https?:)/i.test(url)) return url;
  if (url.startsWith("/")) return `${String(API_BASE_URL || "").replace(/\/+$/, "")}${url}`;
  return null;
}

/** Smallest avatar that wears its frame (below this the ring is noise). */
export const FRAME_MIN_AVATAR_SIZE = 24;

export function shop2FrameSrc(user, size = 40) {
  if (size < FRAME_MIN_AVATAR_SIZE) return null;
  return shop2AssetSrc(user?.equippedAvatarFrame);
}

/** Frame layer inside `.ui-avatar` (Avatar.jsx). */
export function Shop2FrameOverlay({ src, eager = false }) {
  if (!src) return null;
  return (
    <img
      className="ui-avatar-frame-overlay s2-frame"
      src={artUrl(src)}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      loading={eager ? "eager" : "lazy"}
    />
  );
}

/** The shop profile badge someone wears, next to their name (beside country + special badge). */
export function Shop2Badge({ user, compact = false, className = "" }) {
  const { locale } = useLocale();
  const item = user?.equippedBadge;
  const src = shop2AssetSrc(item);
  if (!src) return null;
  const px = compact ? 16 : 18;
  // Lean records carry `i18n.name` (7 languages); the English row name is the fallback.
  const label = localizedShopItemName(item, locale) || "";
  return (
    <img
      className={`s2-badge${compact ? " s2-badge-compact" : ""}${className ? ` ${className}` : ""}`}
      src={src}
      width={px}
      height={px}
      alt={label}
      title={label || undefined}
      draggable={false}
      decoding="async"
      loading="lazy"
    />
  );
}
