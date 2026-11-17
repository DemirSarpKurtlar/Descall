/**
 * Duyurular admin page: pure helpers (no React, no I/O) for the board, the
 * list, the inspector and the composer. Covered by announcements.selftest.mjs.
 */

export const LOCALES = Object.freeze(["tr", "en", "de", "es", "fr", "pt-BR", "ru"]);
export const LOCALE_CODE = Object.freeze({ tr: "TR", en: "EN", de: "DE", es: "ES", fr: "FR", "pt-BR": "PT-BR", ru: "RU" });
export const INTL_TAG = Object.freeze({ tr: "tr-TR", en: "en-US", de: "de-DE", es: "es-ES", fr: "fr-FR", "pt-BR": "pt-BR", ru: "ru-RU" });
export const PRIORITIES = Object.freeze(["normal", "important", "urgent"]);
export const PLATFORMS = Object.freeze(["desktop", "web", "ios", "android"]);
export const COLORS = Object.freeze(["#587af5", "#f2a93b", "#f23f43", "#34c77b", "#9b5de5", "#22c3a6"]);
export const BOARD_COLUMNS = Object.freeze([
  { id: "draft", dot: "#7a7f93" },
  { id: "pending", dot: "#f2a93b" },
  { id: "scheduled", dot: "#9b5de5" },
  { id: "live", dot: "#34c77b" },
  { id: "ended", dot: "#4a4d5e" },
]);
export const LIST_TABS = Object.freeze(["live", "scheduled", "draft", "pending", "ended", "archived"]);
export const END_REASONS = Object.freeze(["expired", "outdated", "mistake", "other"]);
export const DELETE_REASONS = Object.freeze(["outdated", "wrong_content", "wrong_audience", "other"]);
export const TEMPLATE_CATEGORIES = Object.freeze(["maintenance", "feature", "event", "security", "campaign", "rules"]);
export const LIMITS = Object.freeze({ title: 80, content: 1000, ctaLabel: 32 });

const DAY = 86400000;

/* ---------------- numbers and time ---------------- */

export function fmtNumber(n, locale = "tr") {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  try {
    return new Intl.NumberFormat(INTL_TAG[locale] || locale || "tr-TR").format(v);
  } catch {
    return String(v);
  }
}

/** "%76" in Turkish, "76%" elsewhere. */
export function fmtPct(v, locale = "tr", digits = 0) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  try {
    return new Intl.NumberFormat(INTL_TAG[locale] || "tr-TR", { style: "percent", maximumFractionDigits: digits, minimumFractionDigits: digits ? Math.min(digits, 1) : 0 }).format(Number(v) / 100);
  } catch {
    return `${Math.round(Number(v))}%`;
  }
}

export function fmtDateTime(iso, locale = "tr", opts = { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "";
  try {
    return new Intl.DateTimeFormat(INTL_TAG[locale] || "tr-TR", opts).format(new Date(t));
  } catch {
    return new Date(t).toISOString().slice(0, 16).replace("T", " ");
  }
}

/** {unit, n} for "2 sa önce" style labels. */
export function agoParts(iso, now = Date.now()) {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return null;
  const min = Math.max(0, Math.round((now - t) / 60000));
  if (min < 1) return { unit: "now", n: 0 };
  if (min < 60) return { unit: "min", n: min };
  const h = Math.round(min / 60);
  if (h < 24) return { unit: "hour", n: h };
  const d = Math.round(h / 24);
  if (d === 1) return { unit: "yesterday", n: 1 };
  return { unit: "day", n: d };
}

/** Time left until `iso`: {days, hours, minutes} or null when passed / missing. */
export function timeLeft(iso, now = Date.now()) {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t) || t <= now) return null;
  const min = Math.floor((t - now) / 60000);
  return { days: Math.floor(min / 1440), hours: Math.floor((min % 1440) / 60), minutes: min % 60 };
}

/** Turkish locative suffix after a clock time ("02:30'da", "14:15'te"), from how the number is read. */
export function trTimeSuffix(iso) {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const n = d.getMinutes() || d.getHours();
  const unit = n % 10;
  const key = unit ? unit : n === 0 ? 0 : n;
  const map = { 0: "'da", 1: "'de", 2: "'de", 3: "'te", 4: "'te", 5: "'te", 6: "'da", 7: "'de", 8: "'de", 9: "'da", 10: "'da", 20: "'de", 30: "'da", 40: "'ta", 50: "'de" };
  return map[key] || "'de";
}

/** yyyy-mm-ddThh:mm for <input type="datetime-local"> in local time. */
export function toLocalInput(iso) {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fromLocalInput(v) {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/* ---------------- stats ---------------- */

export function seenRate(item) {
  const s = item?.stats || {};
  const d = item?.audienceSize || s.delivered || 0;
  return d > 0 ? Math.min(100, ((s.seen || 0) / d) * 100) : null;
}

/** Funnel rows: Hedef kitle, Teslim edildi, Görüldü, Okundu, Butona tıkladı (width relative to the audience). */
export function funnel(item) {
  const s = item?.stats || {};
  const audience = item?.audienceSize ?? s.delivered ?? 0;
  const base = Math.max(audience, s.delivered || 0, 1);
  const rows = [
    { id: "audience", value: audience },
    { id: "delivered", value: s.delivered || 0 },
    { id: "seen", value: s.seen || 0 },
    { id: "read", value: s.read || 0 },
  ];
  if (item?.ctaUrl) rows.push({ id: "clicked", value: s.clicked || 0 });
  return rows.map((r) => ({ ...r, pct: Math.round((r.value / base) * 1000) / 10 }));
}

/** Seen share per platform (seen / delivered on that platform). */
export function platformRates(item) {
  const p = item?.stats?.platforms || {};
  return PLATFORMS.map((id) => {
    const r = p[id];
    return { id, rate: r && r.delivered > 0 ? (r.seen / r.delivered) * 100 : null, seen: r?.seen || 0 };
  });
}

/* ---------------- languages ---------------- */

/** Per-locale state for a draft in the composer: source | ready | auto | stale | missing. */
export function langStates(draft) {
  const src = draft?.sourceLang || "tr";
  const tr = draft?.translations || {};
  const out = {};
  for (const l of LOCALES) {
    if (l === src) out[l] = "source";
    else if (tr[l] && (tr[l].title || tr[l].content)) out[l] = ["ready", "auto", "stale"].includes(tr[l].state) ? tr[l].state : "ready";
    else out[l] = "missing";
  }
  return out;
}

export function langSummary(states) {
  const list = Object.values(states || {});
  const ready = list.filter((s) => s === "source" || s === "ready").length;
  const missing = LOCALES.filter((l) => states?.[l] === "missing");
  const review = LOCALES.filter((l) => states?.[l] === "auto" || states?.[l] === "stale");
  return { total: LOCALES.length, ready, covered: list.filter((s) => s !== "missing").length, missing, review };
}

/** Text a person in `lang` sees (their version, else English, else the source). */
export function localizedText(draft, lang) {
  const src = draft?.sourceLang || "tr";
  const tr = draft?.translations || {};
  const pick = (l) => {
    if (l === src) return { title: draft?.title || "", content: draft?.content || "", ctaLabel: draft?.ctaLabel || "" };
    const t = tr[l];
    return t && t.title && t.content ? { title: t.title, content: t.content, ctaLabel: t.cta_label || draft?.ctaLabel || "" } : null;
  };
  for (const l of [lang, "en", src]) {
    const hit = pick(l);
    if (hit) return { ...hit, lang: l, fallback: l !== lang };
  }
  return { title: draft?.title || "", content: draft?.content || "", ctaLabel: draft?.ctaLabel || "", lang: src, fallback: src !== lang };
}

/** Checks of the "Çeviri kontrolü" box for one target language. */
export function translationChecks(draft, lang, { templateDate = null } = {}) {
  const out = [];
  const t = draft?.translations?.[lang];
  if (!t) return out;
  if (templateDate) out.push({ id: "date", level: "ok", sample: templateDate });
  if (draft?.ctaUrl) out.push({ id: "link", level: "ok", url: draft.ctaUrl });
  const src = `${draft?.title || ""} ${draft?.content || ""}`;
  const tgt = `${t.title || ""} ${t.content || ""}`;
  const terms = ["Descall+", "Descall", "DesCoin"].filter((w) => src.includes(w));
  const lost = terms.filter((w) => !tgt.includes(w));
  out.push(lost.length ? { id: "glossary_lost", level: "warn", terms: lost } : { id: "glossary", level: "ok", terms: terms.length ? terms : ["Descall", "Descall+"] });
  const a = (draft?.content || "").length;
  const b = (t.content || "").length;
  if (a > 0) {
    const diff = Math.round(((b - a) / a) * 100);
    const lines = phoneLines(t.content);
    if (diff >= 15) out.push({ id: "longer", level: "warn", pct: diff, lines });
    else out.push({ id: "length", level: "ok", pct: diff, lines });
  }
  if (t.state === "stale") out.push({ id: "stale", level: "warn" });
  return out;
}

/** Rough line count of a text in the phone preview card (about 34 characters per line). */
export function phoneLines(text, perLine = 34) {
  return String(text || "")
    .split("\n")
    .reduce((n, part) => n + Math.max(1, Math.ceil(part.length / perLine)), 0);
}

/** Text without the **bold** / *italic* / [link](url) markers (card previews). */
export function plainText(text) {
  return String(text || "")
    .replace(/\[([^\]\n]+)\]\(https:\/\/[^)\s]+\)/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/^\s*[-•]\s+/gm, "");
}

/* ---------------- emoji ---------------- */

const EMOJI_G = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu;
export function hasEmoji(text) {
  EMOJI_G.lastIndex = 0;
  return EMOJI_G.test(String(text || ""));
}
export function stripEmoji(text) {
  return String(text || "").replace(EMOJI_G, "").replace(/[ \t]{2,}/g, " ").replace(/ +\n/g, "\n").replace(/\n +/g, "\n").trim();
}

/* ---------------- CTA ---------------- */

export function ctaKind(url) {
  const s = String(url || "").trim();
  if (!s) return "none";
  if (s.startsWith("/") && !s.startsWith("//") && !/\s/.test(s)) return "app";
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "https:" || !u.hostname.includes(".")) return "bad";
    return /(^|\.)descall\.com$/i.test(u.hostname) ? "own" : "external";
  } catch {
    return "bad";
  }
}

/* ---------------- drafts ---------------- */

export function emptyDraft(overrides = {}) {
  return {
    id: null,
    title: "",
    content: "",
    icon: "megaphone",
    color: COLORS[0],
    priority: "normal",
    ctaLabel: "",
    ctaUrl: "",
    coverUrl: "",
    audience: { premium: null, langs: [], platforms: [], newDays: null },
    startsAt: null,
    endsAt: null,
    pinned: false,
    liveNotify: true,
    push: false,
    sourceLang: "tr",
    translations: {},
    templateKey: null,
    status: "draft",
    ...overrides,
  };
}

export function draftFromItem(item) {
  if (!item) return emptyDraft();
  return emptyDraft({
    id: item.id,
    title: item.title || "",
    content: item.content || "",
    icon: item.icon || "megaphone",
    color: item.color || COLORS[0],
    priority: item.priority || "normal",
    ctaLabel: item.ctaLabel || "",
    ctaUrl: item.ctaUrl || "",
    coverUrl: item.coverUrl || "",
    audience: { premium: null, langs: [], platforms: [], newDays: null, ...(item.audience || {}) },
    startsAt: item.status === "scheduled" || item.status === "draft" || item.status === "pending" ? item.startsAt || null : null,
    endsAt: item.endsAt || null,
    pinned: Boolean(item.pinned),
    liveNotify: item.liveNotify !== false,
    push: Boolean(item.push),
    sourceLang: item.sourceLang || "tr",
    translations: item.translations || {},
    templateKey: item.templateKey || null,
    status: item.status || "draft",
  });
}

/** Body for POST / PUT. */
export function draftPayload(d) {
  return {
    title: d.title,
    content: d.content,
    icon: d.icon,
    color: d.color,
    priority: d.priority,
    ctaLabel: d.ctaLabel,
    ctaUrl: d.ctaUrl,
    coverUrl: d.coverUrl,
    audience: d.audience,
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    pinned: d.pinned,
    liveNotify: d.liveNotify,
    push: d.push,
    sourceLang: d.sourceLang,
    translations: d.translations,
    templateKey: d.templateKey,
  };
}

export function isEveryone(a) {
  return !a?.premium && !(a?.langs || []).length && !(a?.platforms || []).length && !a?.newDays;
}

export function needsApproval(d) {
  return d?.priority === "urgent" && isEveryone(d?.audience);
}

/** Composer "Kontrol" list. */
export function composerChecks(d, { now = Date.now() } = {}) {
  const out = [];
  const title = String(d?.title || "");
  out.push(title.length > 0 && title.length <= LIMITS.title ? { id: "title", level: "ok", n: title.length } : { id: "title_bad", level: "error", n: title.length });
  if (d?.ctaLabel || d?.ctaUrl) {
    const k = ctaKind(d.ctaUrl);
    if (!d.ctaLabel || !d.ctaUrl || k === "bad") out.push({ id: "cta_bad", level: "error" });
    else if (k === "external") out.push({ id: "cta_external", level: "warn" });
    else out.push({ id: "cta", level: "ok" });
  }
  const s = langSummary(langStates(d));
  if (s.missing.length) out.push({ id: "missing", level: "warn", langs: s.missing });
  const autos = LOCALES.filter((l) => d?.translations?.[l]?.state === "auto");
  const stale = LOCALES.filter((l) => d?.translations?.[l]?.state === "stale");
  if (autos.length) out.push({ id: "auto", level: "warn", langs: autos });
  if (stale.length) out.push({ id: "stale", level: "warn", langs: stale });
  if (!s.missing.length && !autos.length && !stale.length) out.push({ id: "langs", level: "ok" });
  if (hasEmoji(d?.title) || hasEmoji(d?.content)) out.push({ id: "emoji", level: "warn" });
  const end = d?.endsAt ? Date.parse(d.endsAt) : NaN;
  const start = d?.startsAt ? Date.parse(d.startsAt) : now;
  if (Number.isFinite(end) && end <= start) out.push({ id: "expiry", level: "error" });
  if (d?.startsAt && Date.parse(d.startsAt) < now - 60000) out.push({ id: "past", level: "warn" });
  if (needsApproval(d)) out.push({ id: "approval", level: "warn" });
  return out;
}

export function hasBlocking(checks) {
  return (checks || []).some((c) => c.level === "error");
}

/* ---------------- board drag rules ---------------- */

/**
 * What dropping a card of status `from` on column `to` does.
 * @returns {null | "submit" | "schedule" | "publish" | "approve" | "reject" | "end" | "reopen" | "unschedule" | "pin"}
 */
export function dropAction(from, to, { needsApproval: na = false } = {}) {
  if (from === to) return null;
  if (from === "draft") {
    if (to === "pending") return "submit";
    if (to === "scheduled") return na ? "submit" : "schedule";
    if (to === "live") return na ? "submit" : "publish";
    return null;
  }
  if (from === "pending") {
    if (to === "live" || to === "scheduled") return "approve";
    if (to === "draft") return "reject";
    if (to === "ended") return "end";
    return null;
  }
  if (from === "scheduled") {
    if (to === "live") return "publish";
    if (to === "draft") return "unschedule";
    if (to === "ended") return "end";
    return null;
  }
  if (from === "live") return to === "ended" ? "end" : null;
  if (from === "ended") return to === "live" ? "reopen" : null;
  return null;
}

/* ---------------- lists ---------------- */

export function matchesQuery(item, q) {
  const s = String(q || "").trim().toLocaleLowerCase("tr");
  if (!s) return true;
  const hay = [item.title, item.content, item.author, item.ctaLabel, ...Object.values(item.translations || {}).map((t) => `${t.title} ${t.content}`)].join(" ").toLocaleLowerCase("tr");
  return s.split(/\s+/).every((w) => hay.includes(w));
}

export function filterItems(items, { q = "", audience = "all", lang = "all" } = {}) {
  return (items || []).filter((i) => {
    if (!matchesQuery(i, q)) return false;
    if (audience === "everyone" && !isEveryone(i.audience)) return false;
    if (audience === "targeted" && isEveryone(i.audience)) return false;
    if (lang !== "all" && (i.langStates?.[lang] || "missing") === "missing") return false;
    return true;
  });
}

export function byColumn(items) {
  const out = { draft: [], pending: [], scheduled: [], live: [], ended: [], archived: [] };
  for (const i of items || []) (out[i.status] || out.draft).push(i);
  const newest = (a, b) => (Date.parse(b.updatedAt || b.publishedAt || b.createdAt || 0) || 0) - (Date.parse(a.updatedAt || a.publishedAt || a.createdAt || 0) || 0);
  out.draft.sort(newest);
  out.pending.sort(newest);
  out.scheduled.sort((a, b) => (Date.parse(a.startsAt || 0) || 0) - (Date.parse(b.startsAt || 0) || 0));
  out.live.sort((a, b) => (Boolean(b.pinned) - Boolean(a.pinned)) || ((a.pinOrder || 99) - (b.pinOrder || 99)) || newest(a, b));
  out.ended.sort((a, b) => (Date.parse(b.endedAt || b.updatedAt || 0) || 0) - (Date.parse(a.endedAt || a.updatedAt || 0) || 0));
  out.archived.sort((a, b) => (Date.parse(b.archivedAt || 0) || 0) - (Date.parse(a.archivedAt || 0) || 0));
  return out;
}

export function pinnedOrder(items) {
  return (items || [])
    .filter((i) => i.pinned && (i.status === "live" || i.status === "scheduled"))
    .sort((a, b) => (a.pinOrder || 99) - (b.pinOrder || 99));
}

/** Move `id` to position `index` in the list of ids. */
export function reorder(ids, id, index) {
  const list = (ids || []).filter((x) => x !== id);
  const at = Math.max(0, Math.min(index, list.length));
  list.splice(at, 0, id);
  return list;
}

/* ---------------- templates ---------------- */

/** Template source with the variables in {braces}, split for rendering chips. */
export function splitVars(text) {
  const out = [];
  const re = /\{([a-zA-Z_]+)\}/g;
  let last = 0;
  let m;
  const s = String(text || "");
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push({ v: m[1] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

export function minutesBetween(start, end) {
  const p = (s) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ""));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const a = p(start);
  const b = p(end);
  if (a == null || b == null) return null;
  return b > a ? b - a : b + 1440 - a;
}

export function todayIso(now = Date.now()) {
  const d = new Date(now);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function templateValues(tpl, now = Date.now()) {
  const out = {};
  for (const v of tpl?.vars || []) {
    if (v.type === "date") out[v.id] = todayIso(now + DAY);
    else if (v.default != null) out[v.id] = v.default;
    else out[v.id] = "";
  }
  return out;
}

/** Download a text file (CSV). */
export function downloadText(filename, text, type = "text/csv;charset=utf-8") {
  if (typeof document === "undefined") return;
  const blob = new Blob(["﻿", text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** API error -> i18n key under annc.err. */
export function errorKey(err) {
  const code = String(err?.code || "");
  const map = {
    STEP_UP_REQUIRED: "stepUp",
    ANNOUNCEMENTS_SCHEMA_MISSING: "schema",
    SECOND_ADMIN_REQUIRED: "secondAdmin",
    NEEDS_APPROVAL: "needsApproval",
    NEEDS_REAPPROVAL: "needsReapproval",
    NOTE_REQUIRED: "note",
    REASON_REQUIRED: "reason",
    TITLE_REQUIRED: "title",
    CONTENT_REQUIRED: "content",
    TITLE_TOO_LONG: "titleLong",
    CONTENT_TOO_LONG: "contentLong",
    BAD_CTA_URL: "ctaUrl",
    CTA_URL_REQUIRED: "ctaUrl",
    CTA_LABEL_REQUIRED: "ctaLabel",
    EXPIRY_BEFORE_START: "expiry",
    BAD_EXPIRY: "expiry",
    SCHEDULE_FAR: "scheduleFar",
    TRANSLATE_UNAVAILABLE: "translateOff",
    TRANSLATE_FAILED: "translate",
    BAD_IMAGE: "image",
    IMAGE_TOO_BIG: "imageBig",
    EXPIRED: "expired",
    NOT_FOUND: "notFound",
    BAD_STATE: "state",
    NAME_REQUIRED: "name",
  };
  return map[code] ? `annc.err.${map[code]}` : null;
}
