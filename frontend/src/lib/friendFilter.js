/**
 * Friends sidebar search (polish world-social-18). The desktop / iPad list ignored the
 * "Ara" field, and every list folded with String.toLowerCase(), so "ilker" missed
 * "İlker" and "ışık" missed "IŞIK". One Turkish-aware matcher for both layouts.
 */
import { foldTr } from "./slashCommands.js";

export { foldTr };

function nameOf(entry) {
  return entry?.displayName || entry?.display_name || entry?.username || "";
}

/** (entry) => boolean for a raw query; matches name, @username, custom status and request preview. */
export function friendMatcher(query) {
  const q = foldTr(String(query || "").trim().replace(/^@/, ""));
  if (!q) return () => true;
  return (entry) => {
    if (!entry) return false;
    const fields = [
      nameOf(entry),
      entry.username,
      entry.nickname,
      entry.customStatus || entry.custom_status,
      entry.preview,
    ];
    return fields.some((v) => v && foldTr(v).includes(q));
  };
}

/** Case- and Turkish-insensitive "contains" for one label (DM names, group names). */
export function foldIncludes(label, query) {
  const q = foldTr(String(query || "").trim());
  if (!q) return true;
  return foldTr(label).includes(q);
}
