/**
 * Avatar fallbacks (approved 2026-10-19, design/ai-look-2026-10-19/04-avatar-fallbacks):
 * colour = PALETTE[crc32(user id) % 6], fixed for the life of the account (a rename does
 * not change it); up to two initials from the visible name, Turkish upper case (i → İ).
 * Flat fill, no white sheen, no gradient. The light letter is ≥ 4.5:1 on every palette entry.
 * A photo, when there is one, replaces all of this.
 */
import { upper as upperCase } from "../i18n/format.js";

export const AVATAR_PALETTE = Object.freeze([
  "#3D5296", // brand blue, muted
  "#2F5F66", // slate teal
  "#584A86", // dusk
  "#7A5636", // umber
  "#4A6340", // moss
  "#7D4458", // plum
]);
/* UI audit #21 (2026-11-06): six low-saturation tones that sit with the brand
   charcoal (#393C4D) and logo blue (#587AF5) instead of the old eight
   saturated hues. Dark fill + light letter (--avatar-fg); the letter is
   >= 5.5:1 and white >= 6.5:1 on every entry. */
export const AVATAR_FG = "#E8ECF8";
// Kept for older imports: the display swatches are the stored colours now.
export const AVATAR_PALETTE_MOCKUP = AVATAR_PALETTE;

let TABLE = null;
function table() {
  if (TABLE) return TABLE;
  TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    TABLE[n] = c >>> 0;
  }
  return TABLE;
}

/** CRC-32 (IEEE, same as zlib.crc32) of the UTF-8 bytes of `str`. */
export function crc32(str) {
  const t = table();
  const bytes = new TextEncoder().encode(String(str ?? ""));
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Stable key for a user/group: the id when there is one, else the name. */
export function avatarKey(entity, fallbackName = "") {
  if (entity && typeof entity === "object") {
    const id = entity.id ?? entity.userId ?? entity.user_id ?? entity._id;
    if (id != null && String(id)) return String(id);
    return String(entity.username || entity.name || fallbackName || "");
  }
  return String(entity ?? fallbackName ?? "");
}

export function avatarColor(key) {
  const k = String(key ?? "");
  if (!k) return AVATAR_PALETTE[0];
  return AVATAR_PALETTE[crc32(k) % AVATAR_PALETTE.length];
}

// Names are user content, not UI text: they keep Turkish casing ("ilker" -> "İ") for
// every viewer, so a person's initials look the same in every UI language.
const upper = (s) => upperCase(s, "tr");

/** "Ayşe Yılmaz" → "AY", "cinar.baskin" → "CB", "Zeynep" → "Z", "" → "?". */
export function avatarInitials(name) {
  const parts = String(name ?? "")
    .trim()
    .replace(/^@+/, "")
    .split(/[\s._\-]+/u)
    .map((p) => p.replace(/^[^\p{L}\p{N}]+/u, ""))
    .filter(Boolean);
  if (!parts.length) return "?";
  const first = Array.from(parts[0])[0] || "";
  const second = parts.length > 1 ? Array.from(parts[1])[0] || "" : "";
  return upper(first + second) || "?";
}
