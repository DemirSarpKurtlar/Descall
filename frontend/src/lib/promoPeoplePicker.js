// Pure helpers for the admin promo "Seçilenler" people picker
// (components/admin/PromoPeoplePicker.jsx). Test: node src/lib/promoPeoplePicker.selftest.mjs

const FROM = "İIıŞşĞğÜüÖöÇçÂâÎîÛû";
const TO = "iiissgguuooccaaiiuu";
const MAP = new Map([...FROM].map((ch, i) => [ch, TO[i]]));

/** Same key as backend lib/promoUserSearch.js fold() and SQL promo_fold(). */
export function fold(s) {
  let out = "";
  for (const ch of String(s ?? "")) out += MAP.get(ch) ?? ch;
  return out.toLowerCase();
}

/** What gets sent: no leading @, single spaces, at most 32 characters. */
export function cleanQuery(raw) {
  return String(raw ?? "")
    .replace(/^\s*@+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);
}

export const DEBOUNCE_MS = 150;
export const MIN_CHARS = 1;

/** Drop already-picked people and duplicates, keep server order (closest first). */
export function visibleHits(hits, picked) {
  const taken = new Set((picked || []).map((p) => p.id));
  const out = [];
  for (const h of hits || []) {
    if (!h || !h.id || taken.has(h.id)) continue;
    taken.add(h.id);
    out.push(h);
  }
  return out;
}

/**
 * [before, match, after] for bolding the typed part, compared on folded text
 * so "ayse" highlights "Ayşe". Matches at a word start first, then anywhere.
 */
export function splitMatch(text, rawQ) {
  const s = String(text ?? "");
  const q = fold(cleanQuery(rawQ));
  if (!q || !s) return [s, "", ""];
  const chars = [...s];
  const folded = chars.map((c) => fold(c));
  const starts = [];
  let pos = 0;
  for (const f of folded) { starts.push(pos); pos += f.length; }
  const hay = folded.join("");
  let at = -1;
  for (let i = 0; i < chars.length; i += 1) {
    const wordStart = i === 0 || /[\s._-]/.test(chars[i - 1]);
    if (wordStart && hay.startsWith(q, starts[i])) { at = i; break; }
  }
  if (at < 0) {
    const idx = hay.indexOf(q);
    if (idx < 0) return [s, "", ""];
    at = starts.findIndex((st) => st === idx);
    if (at < 0) return [s, "", ""];
  }
  let end = at;
  let len = 0;
  while (end < chars.length && len < q.length) { len += folded[end].length; end += 1; }
  return [chars.slice(0, at).join(""), chars.slice(at, end).join(""), chars.slice(end).join("")];
}

/** Keyboard: ↑/↓ wrap around, Home/End jump; -1 means nothing highlighted. */
export function moveActive(active, count, key) {
  if (!count) return -1;
  if (key === "ArrowDown") return active < 0 || active >= count - 1 ? 0 : active + 1;
  if (key === "ArrowUp") return active <= 0 ? count - 1 : active - 1;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return active;
}

/**
 * Where the fixed popover goes. It opens under the field unless the space left
 * above the keyboard (iPhone) or the window bottom is too small and there is
 * more room above; height is capped to the room it has.
 */
export function placePopover({ anchor, viewH, viewTop = 0, kb = 0, wantH = 320, gap = 6, margin = 8 }) {
  const visibleBottom = viewTop + viewH - Math.max(0, kb);
  const below = visibleBottom - anchor.bottom - gap - margin;
  const above = anchor.top - viewTop - gap - margin;
  const side = below >= Math.min(wantH, 180) || below >= above ? "below" : "above";
  const room = Math.max(96, Math.floor(side === "below" ? below : above));
  const maxH = Math.min(wantH, room);
  return side === "below"
    ? { side, top: Math.round(anchor.bottom + gap), left: Math.round(anchor.left), width: Math.round(anchor.width), maxH }
    : { side, bottom: Math.round(viewTop + viewH - anchor.top + gap), left: Math.round(anchor.left), width: Math.round(anchor.width), maxH };
}
