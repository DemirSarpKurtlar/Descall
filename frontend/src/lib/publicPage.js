/**
 * Pure helpers of the public server page desk ("Google'da göster", UI-BRIEF draft A).
 * The backend rules live in backend/lib/serverPublicPage.js; SECTION_KEYS and the limits
 * must match it (publicPage.selftest.mjs compares them).
 */

export const SECTION_KEYS = ["banner", "desc", "tags", "count", "chan", "ev", "rules", "pin"];
export const BASIC_SECTIONS = ["banner", "desc", "tags", "count", "chan"];
export const HIGHLIGHT_SECTIONS = ["ev", "rules", "pin"];
export const DISABLE_REASONS = ["season_break", "too_many_joins", "raid", "other"];
export const RANGES = [7, 30, 90];
export const LIMITS = Object.freeze({
  titleMax: 70,
  titleShown: 60,
  descriptionMax: 170,
  descriptionShown: 155,
  pinMax: 280,
  eventsMax: 5,
  eventTitleMax: 80,
  placeMax: 60,
});

/** Editable state of the desk from the backend reply. */
export function draftFromDesk(desk) {
  const s = desk?.settings || {};
  return {
    title: s.title || "",
    description: s.description || "",
    hidden: [...new Set((s.hidden || []).filter((k) => SECTION_KEYS.includes(k)))].sort(),
    hiddenChannels: [...new Set((s.hiddenChannels || []).map((id) => String(id).toLowerCase()))].sort(),
    pin: s.pin || "",
    events: (s.events || []).map((e) => ({ key: e.id || `${e.title}-${e.startsAt}`, title: e.title || "", startsAt: e.startsAt || "", endsAt: e.endsAt || "", place: e.place || "" })),
  };
}

function eventsKey(list) {
  return JSON.stringify((list || []).map((e) => [e.title.trim(), e.startsAt ? Date.parse(e.startsAt) : null, e.endsAt ? Date.parse(e.endsAt) : null, (e.place || "").trim()]));
}

/** PUT body with only what changed (null when nothing did). */
export function diffDraft(draft, saved) {
  const body = {};
  if (draft.title.trim() !== saved.title.trim()) body.title = draft.title.trim();
  if (draft.description.trim() !== saved.description.trim()) body.description = draft.description.trim();
  if (draft.pin.trim() !== saved.pin.trim()) body.pin = draft.pin.trim();
  if (JSON.stringify([...draft.hidden].sort()) !== JSON.stringify([...saved.hidden].sort())) body.hidden = [...draft.hidden].sort();
  if (JSON.stringify([...draft.hiddenChannels].sort()) !== JSON.stringify([...saved.hiddenChannels].sort())) body.hiddenChannels = [...draft.hiddenChannels].sort();
  if (eventsKey(draft.events) !== eventsKey(saved.events)) {
    body.events = draft.events.map((e) => ({
      title: e.title.trim(),
      startsAt: e.startsAt ? new Date(e.startsAt).toISOString() : "",
      endsAt: e.endsAt ? new Date(e.endsAt).toISOString() : null,
      place: (e.place || "").trim() || null,
    }));
  }
  return Object.keys(body).length ? body : null;
}

export function toggleIn(list, value) {
  const set = new Set(list);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return [...set].sort();
}

/**
 * What the public page would show with this draft: the backend preview (every section,
 * every eligible channel) minus what the owner hides. Same rules as buildPublicPayload.
 */
export function previewPage(preview, draft) {
  if (!preview) return null;
  const hidden = new Set(draft.hidden);
  const out = { ...preview };
  if (hidden.has("banner")) out.bannerUrl = null;
  if (hidden.has("desc")) out.description = "";
  if (hidden.has("tags")) {
    out.tags = [];
    out.category = null;
    out.language = null;
  }
  if (hidden.has("count")) out.counts = null;
  const off = new Set(draft.hiddenChannels);
  if (hidden.has("chan") || !preview.channels) out.channels = null;
  else {
    const text = preview.channels.text.filter((c) => !off.has(String(c.id).toLowerCase()));
    const voice = preview.channels.voice.filter((c) => !off.has(String(c.id).toLowerCase()));
    out.channels = { text, voice, total: text.length + voice.length };
  }
  const now = Date.now();
  const events = draft.events
    .filter((e) => e.title.trim() && Number.isFinite(Date.parse(e.startsAt)) && (Date.parse(e.endsAt) || Date.parse(e.startsAt) + 3 * 3600000) >= now)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .map((e, i) => ({ id: `d${i}`, title: e.title.trim(), startsAt: new Date(e.startsAt).toISOString(), endsAt: e.endsAt ? new Date(e.endsAt).toISOString() : null, place: e.place.trim() || null }));
  out.events = hidden.has("ev") ? [] : events;
  if (hidden.has("rules")) out.rules = [];
  out.pin = hidden.has("pin") ? "" : draft.pin.trim();
  out.seo = { title: draft.title.trim(), description: draft.description.trim() };
  return out;
}

/** Google cuts long text: { text, cut }. */
export function serpText(value, max) {
  const s = String(value || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return { text: s, cut: false };
  return { text: `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`, cut: true };
}

/** Length meter state: "ok" within what Google shows, "warn" when it will be cut. */
export function meterState(length, shown) {
  if (!length) return "empty";
  return length > shown ? "warn" : "ok";
}

/** { key: "now"|"min"|"hour"|"day", n } for "Google 2 gün önce taradı". */
export function agoParts(iso, now = Date.now()) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return null;
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return { key: "now", n: 0 };
  if (s < 3600) return { key: "min", n: Math.floor(s / 60) };
  if (s < 86400) return { key: "hour", n: Math.floor(s / 3600) };
  return { key: "day", n: Math.floor(s / 86400) };
}

/** "9:41" left in the undo window. */
export function clockLeft(untilIso, now = Date.now()) {
  const ms = Date.parse(untilIso || "") - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const sec = Math.ceil(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/** Nice axis maximum and 4 ticks (0, 1/3, 2/3, max). */
export function axis(maxValue) {
  const m = Math.max(1, Number(maxValue) || 0);
  const pow = 10 ** Math.floor(Math.log10(m));
  const top = Math.ceil((m * 1.1) / pow) * pow;
  return { top, ticks: [0, 1, 2, 3].map((i) => Math.round((top * i) / 3)) };
}

/** SVG polyline points for a series in a w x h box (left pad for labels, bottom pad for dates). */
export function linePoints(values, { w, h, top, padL = 34, padR = 10, padT = 12, padB = 22 }) {
  const n = values.length;
  if (!n) return [];
  const px = (i) => padL + (n === 1 ? 0 : (i / (n - 1)) * (w - padL - padR));
  const py = (v) => h - padB - ((Number(v) || 0) / (top || 1)) * (h - padB - padT);
  return values.map((v, i) => [Math.round(px(i) * 10) / 10, Math.round(py(v) * 10) / 10]);
}

/** Shares of a source list for the stacked bar: top 3 + "other", rounded to sum 100. */
export function sourceShares(sources, field = "joins") {
  const rows = (sources || []).map((s) => ({ source: s.source, n: Number(s[field]) || 0 })).filter((s) => s.n > 0).sort((a, b) => b.n - a.n);
  const total = rows.reduce((a, s) => a + s.n, 0);
  if (!total) return { total: 0, parts: [] };
  const top = rows.slice(0, 3);
  const rest = rows.slice(3).reduce((a, s) => a + s.n, 0);
  const parts = [...top, ...(rest ? [{ source: "other", n: rest }] : [])];
  // Merge a second "other".
  const merged = [];
  for (const p of parts) {
    const ex = merged.find((m) => m.source === p.source);
    if (ex) ex.n += p.n;
    else merged.push({ ...p });
  }
  let pct = merged.map((p) => ({ ...p, pct: Math.floor((p.n / total) * 100) }));
  let left = 100 - pct.reduce((a, p) => a + p.pct, 0);
  pct = pct
    .map((p, i) => ({ p, frac: (p.n / total) * 100 - p.pct, i }))
    .sort((a, b) => b.frac - a.frac)
    .map((x) => {
      if (left > 0) {
        left -= 1;
        return { ...x.p, pct: x.p.pct + 1, i: x.i };
      }
      return { ...x.p, i: x.i };
    })
    .sort((a, b) => a.i - b.i)
    .map(({ i, ...p }) => p);
  return { total, parts: pct };
}

/** Value for <input type="datetime-local"> from an ISO time (local time zone). */
export function toLocalInput(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO time from a datetime-local value ("" when empty or invalid). */
export function fromLocalInput(value) {
  if (!value) return "";
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : "";
}

/** Changed field names of an audit entry, mapped to translation keys. */
export function auditFields(changes) {
  if (!changes || typeof changes !== "object") return [];
  const known = ["title", "description", "hidden", "hidden_channels", "pin", "events"];
  return Object.keys(changes).filter((k) => known.includes(k));
}
