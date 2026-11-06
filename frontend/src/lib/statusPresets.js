/**
 * Custom status presets (UI audit #29, 2026-11-06). One list for every
 * custom-status editor (rail status menu, Settings › Profil). The emoji is
 * optional user content stored as the first character of customStatus;
 * with none chosen the editor shows a line icon, never a stand-in emoji.
 */
export const STATUS_EMOJIS = Object.freeze(["😀", "🎮", "🎵", "💼", "📚", "☕", "🍿", "💤"]);

/** "🎮 Ranked" -> { emoji: "🎮", text: "Ranked" }; "Ranked" -> { emoji: "", text: "Ranked" }. */
export function splitStatusEmoji(value) {
  const raw = String(value || "").trim();
  if (!raw) return { emoji: "", text: "" };
  const chars = Array.from(raw);
  const first = chars[0];
  if (STATUS_EMOJIS.includes(first) || /\p{Extended_Pictographic}/u.test(first)) {
    // Keep a following variation selector / ZWJ sequence with the emoji.
    let i = 1;
    while (i < chars.length && /[️‍]|\p{Extended_Pictographic}|\p{Emoji_Modifier}/u.test(chars[i])) i += 1;
    return { emoji: chars.slice(0, i).join(""), text: chars.slice(i).join("").replace(/^\s+/, "") };
  }
  return { emoji: "", text: raw };
}

/** Inverse of splitStatusEmoji. */
export function joinStatusEmoji(emoji, text) {
  const t = String(text || "").trim();
  if (!t) return "";
  return emoji ? `${emoji} ${t}` : t;
}
