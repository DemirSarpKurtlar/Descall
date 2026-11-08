/**
 * Public server directory (item 8): values shared by the app (Discover, listing settings)
 * and the public web pages. Keep CATEGORIES / LANGUAGES / limits identical to
 * backend/lib/serverDirectory.js (backend/lib/serverDirectory.selftest.cjs compares them).
 */

export const DIRECTORY_CATEGORIES = [
  "gaming-minecraft",
  "gaming-fps",
  "gaming-cs2",
  "gaming-lol",
  "gaming-other",
  "study",
  "music",
  "art",
  "tech",
  "anime",
  "sports",
  "chat-friends",
  "other",
];

/** Main language of a listed server (not the site language). */
export const DIRECTORY_LANGUAGES = ["tr", "en", "de", "es", "fr", "pt-BR", "ru", "other"];

export const DIRECTORY_SORTS = ["members", "online", "newest"];

/** A listed server is public only from this many members on. */
export const DIRECTORY_MIN_MEMBERS = 3;
export const DIRECTORY_DESCRIPTION_MAX = 300;
export const DIRECTORY_TAGS_MAX = 5;
export const DIRECTORY_TAG_LEN_MAX = 24;

export function isDirectoryCategory(id) {
  return DIRECTORY_CATEGORIES.includes(String(id || ""));
}

/** "#Survival Games " -> "survival-games" (same rule as the backend); null when empty. */
export function normalizeDirectoryTag(raw) {
  const s = String(raw == null ? "" : raw)
    .normalize("NFC")
    .replace(/^#+/, "")
    .replace(/İ/g, "i")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s || null;
}

/** "a, b, a" -> ["a", "b"]; { tags, tooMany, tooLong }. */
export function parseDirectoryTags(input) {
  const list = Array.isArray(input) ? input : String(input == null ? "" : input).split(",");
  const tags = [];
  let tooLong = false;
  for (const raw of list) {
    const tag = normalizeDirectoryTag(raw);
    if (!tag) continue;
    if (tag.length > DIRECTORY_TAG_LEN_MAX) tooLong = true;
    if (!tags.includes(tag)) tags.push(tag);
  }
  return { tags, tooMany: tags.length > DIRECTORY_TAGS_MAX, tooLong };
}
