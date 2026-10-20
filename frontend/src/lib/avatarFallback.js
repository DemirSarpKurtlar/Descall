/**
 * Avatar fallbacks (approved 2026-10-19, design/ai-look-2026-10-19/04-avatar-fallbacks):
 * colour = PALETTE[crc32(user id) % 8], fixed for the life of the account (a rename does
 * not change it); up to two initials from the visible name, Turkish upper case (i → İ).
 * Flat fill, no white sheen, no gradient. White text is ≥ 4.5:1 on every palette entry.
 * A photo, when there is one, replaces all of this.
 */
export const AVATAR_PALETTE = Object.freeze([
  "#2868FF", // blue
  "#228359", // green
  "#BA590E", // orange
  "#DB2C5B", // pink
  "#7E59EE", // violet
  "#177E96", // teal
  "#926F16", // gold
  "#DA362C", // red
]);
// Display swatches from the mockup (gen.py PAL). The stored colours above are the
// same hues darkened just enough for 4.5:1 white text (rule in the mockup).
export const AVATAR_PALETTE_MOCKUP = Object.freeze(["#5B8CFF", "#2FB67C", "#F08A3C", "#E2557B", "#8C6CF0", "#1FA9C9", "#D9A520", "#E0574F"]);

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

const upper = (s) => {
  try { return s.toLocaleUpperCase("tr-TR"); } catch { return s.toUpperCase(); }
};

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
