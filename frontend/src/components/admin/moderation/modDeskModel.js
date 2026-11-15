/**
 * Moderasyon İşlem masası (owner-approved Draft A, Nov 2026): pure helpers for
 * the page. No React, no fetch. Tested by modDesk.selftest.mjs.
 */

export const TABS = Object.freeze(["apply", "active", "history", "filters"]);

/** Süre pills of the composer (Draft A order) + "Özel". */
export const TIMEOUT_PILLS = Object.freeze(["5m", "15m", "30m", "1h", "6h", "12h", "24h", "3d", "7d"]);
export const CUSTOM = "custom";
export const PRESET_SECONDS = Object.freeze({
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "6h": 21600,
  "12h": 43200,
  "24h": 86400,
  "3d": 3 * 86400,
  "7d": 7 * 86400,
  "14d": 14 * 86400,
  "30d": 30 * 86400,
});

/** Kategori pills shown before "Tüm kategoriler (30)". */
export const FEATURED_CATEGORIES = Object.freeze(["spam", "harassment", "language", "hate_speech", "advertising", "raid", "scam"]);

export const ACTIONS = Object.freeze(["timeout", "ban", "kick"]);
export const CANDIDATE_FILTERS = Object.freeze(["reported", "online", "new"]);
export const LIFT_REASONS = Object.freeze(["wrong_person", "apologized", "appeal_accepted", "too_long", "other"]);
export const EXTEND_STEPS = Object.freeze([3600, 21600, 86400]);
export const MESSAGE_MAX = 500;
export const MAX_SELECTED = 50;

/** Template variables: canonical ids; the composer shows them in the admin's language. */
export const VARS = Object.freeze(["user", "duration", "category", "until"]);

export const FILTER_LANGS = Object.freeze(["tr", "en", "de", "es", "fr", "pt-BR", "ru"]);
export const RULE_KINDS = Object.freeze(["word", "prefix", "regex"]);
export const SEVERITIES = Object.freeze(["low", "medium", "high"]);
export const RULE_ACTIONS = Object.freeze(["mask", "mask_flag", "block", "block_flag", "block_timeout"]);
export const STEP_KINDS = Object.freeze(["warn", "timeout", "kick", "ban"]);
export const HISTORY_PERIODS = Object.freeze(["1", "7", "14", "30", "90"]);
export const HISTORY_TYPES = Object.freeze(["timeout", "ban", "kick", "unban", "untimeout", "timeout_extend", "ban_extend"]);

export function minutesValue(raw) {
  const n = Math.floor(Number(String(raw ?? "").replace(",", ".")));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Seconds of the chosen Süre pill (custom = minutes typed), 0 when unknown. */
export function durationSecondsOf(durationId, customMinutes) {
  if (durationId === CUSTOM) return minutesValue(customMinutes) * 60;
  return PRESET_SECONDS[durationId] || 0;
}

/** Closest pill id for a template / step length (custom when none matches). */
export function pillForSeconds(seconds) {
  const s = Number(seconds) || 0;
  const hit = Object.entries(PRESET_SECONDS).find(([id, v]) => v === s && TIMEOUT_PILLS.includes(id));
  return hit ? hit[0] : CUSTOM;
}

/**
 * Length as words: { n, unit: "m" | "h" | "d" } (the component translates
 * "modDesk.du.<unit>"). Whole units only: 90 min stays minutes.
 */
export function durationParts(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  // One day reads as "24 saat" like the draft; two days and more as days.
  if (s && s % 86400 === 0 && s >= 2 * 86400) return { n: s / 86400, unit: "d" };
  if (s && s % 3600 === 0) return { n: s / 3600, unit: "h" };
  return { n: Math.max(1, Math.round(s / 60)), unit: "m" };
}

/**
 * Time left as the draft writes it: under an hour "04:12" (mm:ss), under a day
 * "2 sa 06 dk", under ten days "6 gün 23 sa", else "29 gün".
 * @returns {{ kind: "mmss", text: string } | { kind: "hm", h: number, m: string } | { kind: "dh", d: number, h: number } | { kind: "d", d: number } | { kind: "over" }}
 */
export function remainingParts(ms) {
  const total = Math.floor((Number(ms) || 0) / 1000);
  if (total <= 0) return { kind: "over" };
  if (total < 3600) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return { kind: "mmss", text: `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` };
  }
  if (total < 86400) return { kind: "hm", h: Math.floor(total / 3600), m: String(Math.floor((total % 3600) / 60)).padStart(2, "0") };
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  if (d < 10 && h) return { kind: "dh", d, h };
  return { kind: "d", d };
}

/** Elapsed share of a sanction, 0..1 (the progress bar fills as time passes). */
export function elapsedShare(startedAt, endsAt, now = Date.now()) {
  const a = Date.parse(startedAt);
  const b = Date.parse(endsAt);
  if (!Number.isFinite(b)) return 1;
  if (!Number.isFinite(a) || b <= a) return now >= b ? 1 : 0;
  return Math.min(1, Math.max(0, (now - a) / (b - a)));
}

/**
 * Board lanes (Aktif yaptırımlar): ending within the hour first, then the rest
 * of the timeouts, timed bans and permanent bans.
 */
export function laneOf(item, now = Date.now()) {
  if (item.endsAt && Date.parse(item.endsAt) - now <= 3600000) return "soon";
  if (item.type === "timeout") return "timeouts";
  return item.endsAt ? "tempBans" : "permBans";
}

export function groupLanes(items, now = Date.now()) {
  const out = { soon: [], timeouts: [], tempBans: [], permBans: [] };
  for (const it of items || []) out[laneOf(it, now)].push(it);
  for (const k of Object.keys(out)) out[k].sort((a, b) => (a.endsAt ? Date.parse(a.endsAt) : Infinity) - (b.endsAt ? Date.parse(b.endsAt) : Infinity));
  return out;
}

/**
 * Chip on a user row in "Kullanıcı seç": banned, muted, the coming n-th
 * violation (2+ sanctions in 30 days) or a repeat offender (an earlier ban).
 * @returns {{ kind: "banned"|"muted"|"nth"|"repeat", n?: number } | null}
 */
export function userChip(u) {
  if (!u) return null;
  if (u.banned) return { kind: "banned" };
  if (u.timedOut) return { kind: "muted" };
  if ((u.sanctions30d || 0) >= 2) return { kind: "nth", n: u.sanctions30d + 1 };
  if ((u.bans || 0) >= 1) return { kind: "repeat" };
  return null;
}

/** Facts under the name: reports, timeouts, an old ban; "clean" when none. */
export function userFacts(u) {
  const out = [];
  if (u?.reports) out.push({ key: "reports", n: u.reports });
  if (u?.timeouts) out.push({ key: "timeouts", n: u.timeouts });
  if (u?.bans) out.push({ key: "bans", n: u.bans });
  if (!out.length) out.push({ key: "clean" });
  return out;
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Canonical {user} … tokens ↔ the admin's own words ({kullanıcı} …).
 * @param {Record<string, string>} names  { user: "kullanıcı", duration: "süre", … }
 */
export function toLocalTokens(text, names) {
  let out = String(text || "");
  for (const v of VARS) if (names?.[v] && names[v] !== v) out = out.replace(new RegExp(`\\{${v}\\}`, "g"), `{${names[v]}}`);
  return out;
}

export function toCanonicalTokens(text, names) {
  let out = String(text || "");
  for (const v of VARS) if (names?.[v] && names[v] !== v) out = out.replace(new RegExp(`\\{${escapeRe(names[v])}\\}`, "g"), `{${v}}`);
  return out;
}

/** Fill a note for one user: canonical and local tokens both work. */
export function fillMessage(text, values, names) {
  const canonical = toCanonicalTokens(text, names);
  return canonical
    .replace(/\{(user|duration|category|until)\}/g, (_, k) => (values?.[k] != null ? String(values[k]) : `{${k}}`))
    .replace(/[ \t]{2,}/g, " ");
}

/**
 * Highlight runs for a message: [{ text, sev: "high"|"medium"|"low"|null }].
 * Overlapping matches merge, keeping the strongest severity.
 */
export function highlightSegments(text, matches) {
  const src = String(text || "");
  const rank = { low: 1, medium: 2, high: 3 };
  const marks = new Array(src.length).fill(0);
  for (const m of matches || []) {
    const r = rank[m.severity] || 2;
    for (let i = Math.max(0, m.start); i < Math.min(src.length, m.end); i += 1) if (r > marks[i]) marks[i] = r;
  }
  const names = [null, "low", "medium", "high"];
  const out = [];
  let i = 0;
  while (i < src.length) {
    const r = marks[i];
    let j = i;
    while (j < src.length && marks[j] === r) j += 1;
    out.push({ text: src.slice(i, j), sev: names[r] });
    i = j;
  }
  return out;
}

/** CSS tone for a severity: hi / md / lo. */
export function sevTone(sev) {
  return sev === "high" ? "hi" : sev === "low" ? "lo" : "md";
}

/** Chip tone + key of a history status. */
export function statusChip(status) {
  switch (status) {
    case "active":
      return { tone: "gold", key: "active" };
    case "lifted":
      return { tone: "blue", key: "lifted" };
    case "appeal_pending":
      return { tone: "blue", key: "appealPending" };
    case "appeal_rejected":
      return { tone: "red", key: "appealRejected" };
    case "appeal_accepted":
      return { tone: "green", key: "appealAccepted" };
    case "ended":
      return { tone: "gray", key: "ended" };
    default:
      return { tone: "gray", key: "done" };
  }
}

/** Tone of an action chip in Geçmiş. */
export function actionTone(action) {
  if (action === "ban" || action === "ban_extend") return "red";
  if (action === "timeout" || action === "timeout_extend") return "gold";
  if (action === "unban" || action === "untimeout") return "green";
  return "gray";
}

/**
 * The bulk request for timeout / kick: one item per user with its own filled note.
 * @param {{ action: string, users: object[], category: string, otherText?: string, durationId: string, customMinutes?: string, message: string, notify?: boolean, templateId?: string|null, flaggedId?: string|null, names: object, labelFor: (u: object) => object }} p
 */
export function buildBulkPayload({ action, users, category, otherText, durationId, customMinutes, message, notify = false, templateId = null, flaggedId = null, names, labelFor }) {
  const body = {
    action,
    category,
    items: (users || []).slice(0, MAX_SELECTED).map((u) => {
      const filled = fillMessage(message, labelFor ? labelFor(u) : {}, names).trim().slice(0, MESSAGE_MAX);
      return filled ? { userId: u.id, message: filled } : { userId: u.id };
    }),
  };
  if (category === "other") body.otherText = String(otherText || "").trim().slice(0, 200);
  if (action === "timeout") {
    if (durationId === CUSTOM) body.durationSeconds = durationSecondsOf(CUSTOM, customMinutes);
    else body.presetId = durationId;
  }
  if (notify) body.notify = true;
  if (templateId) body.templateId = templateId;
  if (flaggedId) body.flaggedId = flaggedId;
  return body;
}

/** What blocks the primary button, as a modDesk.err.* key, or null. */
export function composerError({ action, users, category, otherText, durationId, customMinutes }) {
  if (!users || !users.length) return "noUsers";
  if (!category) return "noCategory";
  if (category === "other" && !String(otherText || "").trim()) return "otherText";
  if (action === "timeout" && durationSecondsOf(durationId, customMinutes) < 60) return "duration";
  return null;
}

/** Most severe escalation among the selected users (shown in the red Kademe box). */
export function topEscalation(items) {
  const list = (items || []).filter((x) => x && x.stronger);
  if (!list.length) return null;
  const weight = (s) => ["warn", "timeout", "kick", "ban"].indexOf(s?.kind) * 1e13 + (s?.seconds == null ? (s?.kind === "ban" ? 1e12 : 0) : s.seconds);
  return list.reduce((a, b) => (weight(b.step) > weight(a.step) ? b : a));
}

/** Ban preset id (BanDialog pills) closest to a step length. */
export function banPresetFor(seconds) {
  if (seconds == null) return "permanent";
  const table = [["24h", 86400], ["3d", 3 * 86400], ["7d", 7 * 86400], ["30d", 30 * 86400], ["90d", 90 * 86400]];
  let best = table[0];
  for (const row of table) if (Math.abs(row[1] - seconds) < Math.abs(best[1] - seconds)) best = row;
  return best[0];
}

/** Language tabs of the word filter: always tr, en and "all", others when used. */
export function languageTabs(byLanguage) {
  const counts = byLanguage || {};
  const out = [];
  for (const id of FILTER_LANGS) if (id === "tr" || id === "en" || counts[id]) out.push({ id, count: counts[id] || 0 });
  out.push({ id: "all", count: counts.all || 0 });
  return out;
}

/** "word", "word*" or "/regex/" → the kind the dropdown should show. */
export function detectKind(input) {
  const s = String(input || "").trim();
  if (s.length > 2 && s.startsWith("/") && s.lastIndexOf("/") > 0) return "regex";
  if (s.endsWith("*")) return "prefix";
  return "word";
}

/** Spark bar heights (percent, at least 8 so a zero day still shows a stub). */
export function sparkHeights(values) {
  const list = Array.isArray(values) && values.length ? values : [0, 0, 0, 0, 0, 0, 0];
  const max = Math.max(1, ...list);
  return list.map((v) => Math.max(8, Math.round(((Number(v) || 0) / max) * 100)));
}

/** Pending queue header: "9 bekliyor · En eski 3 saat" parts. */
export function oldestParts(oldestAt, now = Date.now()) {
  const t = Date.parse(oldestAt);
  if (!Number.isFinite(t)) return null;
  const mins = Math.max(0, Math.floor((now - t) / 60000));
  if (mins < 60) return { n: Math.max(1, mins), unit: "m" };
  if (mins < 1440) return { n: Math.floor(mins / 60), unit: "h" };
  return { n: Math.floor(mins / 1440), unit: "d" };
}

/** Query string for GET /moderation/history/search. */
export function historyQuery({ q = "", type = "", category = "", actor = "", days = "14", offset = 0, limit = 40 } = {}) {
  const p = new URLSearchParams();
  if (q.trim()) p.set("q", q.trim());
  if (HISTORY_TYPES.includes(type)) p.set("type", type);
  if (category) p.set("category", category);
  if (actor) p.set("actor", actor);
  p.set("days", HISTORY_PERIODS.includes(String(days)) ? String(days) : "14");
  p.set("offset", String(Math.max(0, offset | 0)));
  p.set("limit", String(Math.max(1, Math.min(200, limit | 0))));
  return p.toString();
}

/** Stacked bar heights for the history chart, as percent of the busiest day. */
export function chartBars(chart) {
  const days = Array.isArray(chart) ? chart : [];
  const max = Math.max(1, ...days.map((d) => (d.timeout || 0) + (d.ban || 0) + (d.kick || 0)));
  return days.map((d) => ({
    day: d.day,
    timeout: ((d.timeout || 0) / max) * 100,
    ban: ((d.ban || 0) / max) * 100,
    kick: ((d.kick || 0) / max) * 100,
    total: (d.timeout || 0) + (d.ban || 0) + (d.kick || 0),
  }));
}

/** Toggle one id in a selection, capped at MAX_SELECTED. */
export function toggleSelection(list, user) {
  const cur = Array.isArray(list) ? list : [];
  if (!user?.id) return cur;
  if (cur.some((u) => u.id === user.id)) return cur.filter((u) => u.id !== user.id);
  if (cur.length >= MAX_SELECTED) return cur;
  return [...cur, user];
}

/** Steps of a rule as "1. İhlal" cards: [{ index, step }]. */
export function ladder(steps) {
  return (Array.isArray(steps) ? steps : []).map((step, i) => ({ index: i + 1, step }));
}
