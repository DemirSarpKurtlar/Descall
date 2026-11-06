/**
 * Server icon fallback: initials that keep numbers whole, so "Sunucu 1" and
 * "Sunucu 10" read "S1" and "S10" instead of both "S1", on a colour picked from the
 * server id (same palette and hash as the letter avatars).
 */
import { avatarColor } from "./avatarFallback.js";

/** "Büyük Sunucu" → "BS", "Sunucu 10" → "S10", "oyun" → "O", "" → "?". */
export function serverInitials(name) {
  const words = String(name ?? "")
    .trim()
    .split(/\s+/u)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+/u, ""))
    .filter(Boolean);
  if (!words.length) return "?";
  const number = words.find((w, i) => i > 0 && /^\p{N}+$/u.test(w));
  const first = Array.from(words[0])[0] || "";
  if (/^\p{N}+$/u.test(words[0])) return words[0].slice(0, 3);
  if (number) return (first.toLocaleUpperCase("tr") + number.slice(0, 3)) || "?";
  const second = words.length > 1 ? Array.from(words[1])[0] || "" : "";
  return (first + second).toLocaleUpperCase("tr") || "?";
}

/** Fallback tile colour for a server without an icon (stable per server). */
export function serverColor(server, name = "") {
  const key = server?.id ?? server?._id ?? name ?? server?.name ?? "";
  return avatarColor(String(key));
}
