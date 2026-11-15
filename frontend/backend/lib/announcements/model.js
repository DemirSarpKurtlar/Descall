"use strict";

/**
 * Duyurular (admin remake, owner-approved Drafts C + A, Nov 2026): pure rules
 * shared by the admin routes, the user feed and the scheduler. No I/O here.
 *
 *  - lifecycle: draft -> pending (second admin approval) -> scheduled -> live -> ended -> archived
 *  - language versions: source text + translations for the 7 app locales; a
 *    person whose language has no version sees the English one (then the source)
 *  - audience: everyone, Descall+ members / non-members, languages, platforms,
 *    people who joined in the last N days (combinable, empty = everyone)
 *  - line icon keys (the stored legacy emoji map to the same keys)
 *  - built-in templates with typed variables (date / time / duration / choice /
 *    percent / text), rendered per language
 */

const LOCALES = Object.freeze(["tr", "en", "de", "es", "fr", "pt-BR", "ru"]);
const FALLBACK_LANG = "en";
const PRIORITIES = Object.freeze(["normal", "important", "urgent"]);
const STATUSES = Object.freeze(["draft", "pending", "scheduled", "live", "ended", "archived"]);
const PLATFORMS = Object.freeze(["desktop", "web", "ios", "android"]);
const COLORS = Object.freeze({ blue: "#587af5", amber: "#f2a93b", red: "#f23f43", green: "#34c77b", violet: "#9b5de5", teal: "#22c3a6" });
const ICONS = Object.freeze([
  "megaphone", "siren", "check", "alert", "bell", "party", "wrench", "pin",
  "info", "star", "gift", "shop", "calendar", "shield", "lock", "message", "phone", "users", "heart", "rocket",
]);
// Stored glyphs of the old picker and the live popup -> the line icon key.
const LEGACY_EMOJI = Object.freeze({
  "📢": "megaphone", "📣": "megaphone", "🔔": "bell", "🚨": "siren", "⚠️": "alert", "⚠": "alert",
  "✅": "check", "🎉": "party", "🔧": "wrench", "🔒": "lock", "💬": "message", "📌": "pin",
  "🛍": "shop", "🛍️": "shop", "🛒": "shop", "👥": "users", "💙": "heart", "❤️": "heart", "🏅": "star",
  "⭐": "star", "🎁": "gift", "📅": "calendar", "🛡️": "shield", "📱": "phone", "🚀": "rocket", "ℹ️": "info",
});
const LIMITS = Object.freeze({ title: 80, content: 1000, ctaLabel: 32, ctaUrl: 300, reason: 300, templateName: 80 });
const DELETE_REASONS = Object.freeze(["outdated", "wrong_content", "wrong_audience", "other"]);
const END_REASONS = Object.freeze(["expired", "outdated", "mistake", "other"]);
const KNOWN_APP_PATHS = ["/settings", "/feedback", "/servers", "/friends", "/activity", "/direct", "/groups", "/calls", "/status", "/terms", "/privacy", "/faq", "/download", "/features", "/security", "/contact", "/blog"];

function fail(code, message, status = 400) {
  return { ok: false, code, error: message, status };
}

function normLang(raw) {
  const s = String(raw || "").trim().replace("_", "-");
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === "pt-br" || lower === "pt") return "pt-BR";
  const two = lower.slice(0, 2);
  return LOCALES.includes(two) ? two : null;
}

function platformOf(app) {
  const a = String(app || "").toLowerCase();
  if (a === "electron" || a === "desktop") return "desktop";
  if (a === "ios") return "ios";
  if (a === "android") return "android";
  return PLATFORMS.includes(a) ? a : "web";
}

/** Platforms a person used, from users.active_sessions (estimates only; the feed uses the live platform). */
function platformsFromSessions(sessions) {
  const out = new Set();
  for (const s of Array.isArray(sessions) ? sessions : []) {
    const ua = `${s?.userAgent || ""} ${s?.device || ""}`;
    if (/electron|descall-desktop/i.test(ua)) out.add("desktop");
    else if (/iphone|ipad|ios/i.test(ua)) out.add("ios");
    else if (/android/i.test(ua)) out.add("android");
    else if (ua.trim()) out.add("web");
  }
  return [...out];
}

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/u;
const EMOJI_RE_G = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu;
function hasEmoji(text) {
  return EMOJI_RE.test(String(text || ""));
}
function stripEmoji(text) {
  return String(text || "")
    .replace(EMOJI_RE_G, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\n +/g, "\n")
    .trim();
}

function iconOf(row) {
  const key = String(row?.icon || "").trim();
  if (ICONS.includes(key)) return key;
  const raw = String(row?.emoji || "").trim();
  return LEGACY_EMOJI[raw] || LEGACY_EMOJI[raw.replace(/️/g, "")] || "megaphone";
}

function colorOf(raw) {
  const s = String(raw || "").trim();
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : COLORS.blue;
}

function ts(v) {
  const t = v ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : null;
}

/** Stored status, NULL rows read like before (is_active). */
function baseStatus(row) {
  const s = String(row?.status || "");
  if (STATUSES.includes(s)) return s;
  return row?.is_active === false ? "ended" : "live";
}

/** Status as people see it right now (expiry and the publish time applied). */
function statusOf(row, now = Date.now()) {
  const s = baseStatus(row);
  if (s === "scheduled") {
    const at = ts(row.starts_at);
    if (at != null && at <= now) {
      const end = ts(row.ends_at);
      return end != null && end <= now ? "ended" : "live";
    }
  }
  if (s === "live") {
    const end = ts(row.ends_at);
    if (end != null && end <= now) return "ended";
  }
  return s;
}

/* ---------------- audience ---------------- */

function normalizeAudience(raw) {
  const a = raw && typeof raw === "object" ? raw : {};
  const premium = a.premium === "member" || a.premium === "non_member" ? a.premium : null;
  const langs = [...new Set((Array.isArray(a.langs) ? a.langs : []).map(normLang).filter(Boolean))];
  const platforms = [...new Set((Array.isArray(a.platforms) ? a.platforms : []).map((p) => String(p || "").toLowerCase()).filter((p) => PLATFORMS.includes(p)))];
  const n = Math.round(Number(a.newDays));
  const newDays = Number.isFinite(n) && n >= 1 && n <= 365 ? n : null;
  return { premium, langs: LOCALES.filter((l) => langs.includes(l)), platforms: PLATFORMS.filter((p) => platforms.includes(p)), newDays };
}

function isEveryone(audience) {
  const a = normalizeAudience(audience);
  return !a.premium && !a.langs.length && !a.platforms.length && !a.newDays;
}

/** Stable key of an audience (one cache entry per distinct audience). */
function audienceKey(audience) {
  const a = normalizeAudience(audience);
  return [a.premium || "-", a.langs.join(",") || "-", a.platforms.join(",") || "-", a.newDays || "-"].join("|");
}

/**
 * @param {object} audience
 * @param {{lang?: string|null, platform?: string|null, premium?: boolean, createdAt?: string|null}} who
 */
function matchAudience(audience, who = {}, now = Date.now()) {
  const a = normalizeAudience(audience);
  if (a.premium === "member" && !who.premium) return false;
  if (a.premium === "non_member" && who.premium) return false;
  if (a.langs.length && !a.langs.includes(normLang(who.lang) || "")) return false;
  if (a.platforms.length) {
    const list = Array.isArray(who.platforms) ? who.platforms : [platformOf(who.platform)];
    if (!list.some((p) => a.platforms.includes(p))) return false;
  }
  if (a.newDays) {
    const joined = ts(who.createdAt);
    if (joined == null || now - joined > a.newDays * 86400000) return false;
  }
  return true;
}

function needsApproval(priority, audience) {
  return priority === "urgent" && isEveryone(audience);
}

/* ---------------- CTA ---------------- */

function sanitizeCtaUrl(raw) {
  let s = String(raw || "").trim();
  if (!s) return { ok: true, url: "", kind: "none" };
  if (s.length > LIMITS.ctaUrl) return { ok: false };
  if (s.startsWith("//") || s.includes("\\")) return { ok: false };
  if (s.startsWith("/") && !s.startsWith("//") && !s.includes("\\") && !/\s/.test(s)) {
    const known = KNOWN_APP_PATHS.some((p) => s === p || s.startsWith(`${p}/`) || s.startsWith(`${p}?`));
    return { ok: true, url: s, kind: known ? "app" : "app_unknown" };
  }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" || !u.hostname.includes(".") || u.username || u.password) return { ok: false };
    const host = u.hostname.toLowerCase();
    const own = host === "descall.com" || host.endsWith(".descall.com");
    return { ok: true, url: u.toString(), kind: own ? "own" : "external", host };
  } catch {
    return { ok: false };
  }
}

/* ---------------- language versions ---------------- */

function sourceText(row) {
  return { title: String(row?.title || ""), content: String(row?.content || ""), cta_label: String(row?.cta_label || "") };
}

function cleanTranslations(raw, sourceLang) {
  const out = {};
  const obj = raw && typeof raw === "object" ? raw : {};
  for (const lang of LOCALES) {
    if (lang === sourceLang) continue;
    const t = obj[lang];
    if (!t || typeof t !== "object") continue;
    const title = String(t.title || "").trim().slice(0, LIMITS.title);
    const content = String(t.content || "").trim().slice(0, LIMITS.content);
    if (!title && !content) continue;
    const state = ["ready", "auto", "stale"].includes(t.state) ? t.state : "ready";
    out[lang] = {
      title,
      content,
      cta_label: String(t.cta_label || t.ctaLabel || "").trim().slice(0, LIMITS.ctaLabel),
      state,
      by: t.by ? String(t.by).slice(0, 40) : null,
      at: t.at || null,
    };
  }
  return out;
}

/** Per-locale state: source | ready | auto | stale | missing. */
function translationStates(row) {
  const src = normLang(row?.source_lang) || "tr";
  const tr = row?.translations && typeof row.translations === "object" ? row.translations : {};
  const out = {};
  for (const lang of LOCALES) {
    if (lang === src) out[lang] = "source";
    else if (tr[lang] && (tr[lang].title || tr[lang].content)) out[lang] = ["ready", "auto", "stale"].includes(tr[lang].state) ? tr[lang].state : "ready";
    else out[lang] = "missing";
  }
  return out;
}

/** Text for one person: their language, else English, else the source. */
function localize(row, lang) {
  const src = normLang(row?.source_lang) || "tr";
  const want = normLang(lang) || FALLBACK_LANG;
  const tr = row?.translations && typeof row.translations === "object" ? row.translations : {};
  const pick = (l) => {
    if (l === src) return sourceText(row);
    const t = tr[l];
    if (t && t.title && t.content) return { title: t.title, content: t.content, cta_label: t.cta_label || "" };
    return null;
  };
  for (const l of [want, FALLBACK_LANG, src]) {
    const hit = pick(l);
    if (hit) {
      const base = sourceText(row);
      return { title: hit.title, content: hit.content, ctaLabel: hit.cta_label || base.cta_label || "", lang: l, fallback: l !== want };
    }
  }
  const base = sourceText(row);
  return { title: base.title, content: base.content, ctaLabel: base.cta_label, lang: src, fallback: src !== want };
}

/** After the source text changed, translations that were ready need another look. */
function markStale(translations, changedFields) {
  if (!changedFields.length) return translations;
  const out = {};
  for (const [lang, t] of Object.entries(translations || {})) out[lang] = t.state === "ready" || t.state === "auto" ? { ...t, state: "stale" } : t;
  return out;
}

/* ---------------- validation ---------------- */

function cleanText(v, max) {
  return String(v == null ? "" : v).replace(/\r\n/g, "\n").trim().slice(0, max + 1);
}

function parseTime(v) {
  if (v == null || v === "") return { ok: true, at: null };
  const t = Date.parse(String(v));
  if (!Number.isFinite(t)) return { ok: false };
  return { ok: true, at: new Date(t).toISOString() };
}

/**
 * Admin input -> columns. `partial` keeps fields that were not sent.
 * @returns {{ok: true, value: object} | {ok: false, code: string, error: string}}
 */
function validateDraft(input = {}, { partial = false, now = Date.now(), requireText = true } = {}) {
  const v = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(input, k);
  if (!partial || has("title")) {
    const title = cleanText(input.title, LIMITS.title);
    if (requireText && !title) return fail("TITLE_REQUIRED", "Title is required.");
    if (title.length > LIMITS.title) return fail("TITLE_TOO_LONG", `Title must be ${LIMITS.title} characters or fewer.`);
    v.title = title;
  }
  if (!partial || has("content")) {
    const content = cleanText(input.content, LIMITS.content);
    if (requireText && !content) return fail("CONTENT_REQUIRED", "Message is required.");
    if (content.length > LIMITS.content) return fail("CONTENT_TOO_LONG", `Message must be ${LIMITS.content} characters or fewer.`);
    v.content = content;
  }
  if (!partial || has("icon")) {
    const icon = String(input.icon || "megaphone");
    v.icon = ICONS.includes(icon) ? icon : "megaphone";
  }
  if (!partial || has("color")) v.color = colorOf(input.color);
  if (!partial || has("priority")) {
    const p = String(input.priority || "normal");
    if (!PRIORITIES.includes(p)) return fail("BAD_PRIORITY", "Unknown priority.");
    v.priority = p;
  }
  if (!partial || has("ctaLabel") || has("ctaUrl")) {
    const label = cleanText(input.ctaLabel, LIMITS.ctaLabel);
    if (label.length > LIMITS.ctaLabel) return fail("CTA_LABEL_TOO_LONG", `Button text must be ${LIMITS.ctaLabel} characters or fewer.`);
    const url = sanitizeCtaUrl(input.ctaUrl);
    if (!url.ok) return fail("BAD_CTA_URL", "The button link must be an https address or an app path.");
    if (label && !url.url) return fail("CTA_URL_REQUIRED", "Add a link for the button.");
    if (!label && url.url) return fail("CTA_LABEL_REQUIRED", "Add a text for the button.");
    v.cta_label = label || null;
    v.cta_url = url.url || null;
  }
  if (!partial || has("coverUrl")) {
    const c = String(input.coverUrl || "").trim();
    if (c && !/^https:\/\/[^\s]+$/i.test(c)) return fail("BAD_COVER", "Cover image must be an https address.");
    v.cover_url = c || null;
  }
  if (!partial || has("audience")) v.audience = normalizeAudience(input.audience);
  if (!partial || has("startsAt")) {
    const s = parseTime(input.startsAt);
    if (!s.ok) return fail("BAD_SCHEDULE", "Publish time is not a valid date.");
    if (s.at && Date.parse(s.at) > now + 90 * 86400000) return fail("SCHEDULE_FAR", "Publish time can be at most 90 days ahead.");
    v.starts_at = s.at;
  }
  if (!partial || has("endsAt")) {
    const e = parseTime(input.endsAt);
    if (!e.ok) return fail("BAD_EXPIRY", "End time is not a valid date.");
    v.ends_at = e.at;
  }
  const start = v.starts_at !== undefined ? v.starts_at : null;
  if (v.ends_at && Date.parse(v.ends_at) <= Math.max(now, start ? Date.parse(start) : 0)) {
    return fail("EXPIRY_BEFORE_START", "End time must be after the publish time.");
  }
  if (!partial || has("pinned")) v.pinned = Boolean(input.pinned);
  if (!partial || has("liveNotify")) v.live_notify = input.liveNotify !== false;
  if (!partial || has("push")) v.push = Boolean(input.push);
  if (!partial || has("sourceLang")) v.source_lang = normLang(input.sourceLang) || "tr";
  if (!partial || has("translations")) v.translations = cleanTranslations(input.translations, v.source_lang || normLang(input.sourceLang) || "tr");
  if (!partial || has("templateKey")) {
    const k = String(input.templateKey || "").trim();
    v.template_key = /^(b:[a-z_]+|c:[0-9a-f-]{36})$/i.test(k) ? k : null;
  }
  return { ok: true, value: v };
}

/** Things to look at before publishing (composer "Kontrol"). level: ok | warn | error. */
function prePublishChecks(row, { now = Date.now() } = {}) {
  const out = [];
  const title = String(row.title || "");
  const content = String(row.content || "");
  out.push(title.length && title.length <= LIMITS.title ? { id: "title", level: "ok", n: title.length } : { id: "title", level: "error", n: title.length });
  if (row.cta_url || row.cta_label) {
    const u = sanitizeCtaUrl(row.cta_url);
    if (!u.ok || !u.url || !row.cta_label) out.push({ id: "cta", level: "error" });
    else if (u.kind === "external" || u.kind === "app_unknown") out.push({ id: "cta_external", level: "warn", host: u.host || u.url });
    else out.push({ id: "cta", level: "ok" });
  }
  const states = translationStates(row);
  const missing = LOCALES.filter((l) => states[l] === "missing");
  const review = LOCALES.filter((l) => states[l] === "auto" || states[l] === "stale");
  if (missing.length) out.push({ id: "missing_langs", level: "warn", langs: missing });
  if (review.length) out.push({ id: "review_langs", level: "warn", langs: review });
  if (!missing.length && !review.length) out.push({ id: "langs", level: "ok" });
  if (hasEmoji(title) || hasEmoji(content)) out.push({ id: "emoji", level: "warn" });
  const end = ts(row.ends_at);
  const start = ts(row.starts_at) || now;
  if (end != null && end <= start) out.push({ id: "expiry", level: "error" });
  if (needsApproval(row.priority, row.audience)) out.push({ id: "approval", level: "warn" });
  return out;
}

/* ---------------- views ---------------- */

const LEGACY_COLUMNS = "id, title, content, created_at, created_by, is_active, priority, color, emoji, pinned, target, author";

function ctaFields(row, text) {
  return row.cta_url && (text.ctaLabel || row.cta_label) ? { ctaLabel: text.ctaLabel || row.cta_label, ctaUrl: row.cta_url } : { ctaLabel: "", ctaUrl: "" };
}

/** What a member's app gets (localized). `read` is the person's announcement_reads row. */
function publicView(row, lang, read = null, now = Date.now()) {
  const text = localize(row, lang);
  return {
    id: row.id,
    title: text.title,
    content: text.content,
    ...ctaFields(row, text),
    coverUrl: row.cover_url || null,
    icon: iconOf(row),
    emoji: row.emoji || null,
    color: colorOf(row.color),
    priority: PRIORITIES.includes(row.priority) ? row.priority : "normal",
    pinned: Boolean(row.pinned),
    pinOrder: row.pinned ? Number(row.pin_order) || null : null,
    author: row.author || null,
    createdAt: row.published_at || row.starts_at && ts(row.starts_at) <= now && row.starts_at || row.created_at || null,
    created_at: row.published_at || row.created_at || null,
    endsAt: row.ends_at || null,
    lang: text.lang,
    fallback: text.fallback,
    target: row.target || "all",
    seen: Boolean(read?.seen_at || read?.read_at),
    read: Boolean(read?.read_at),
    clicked: Boolean(read?.clicked_at),
  };
}

/** Pinned first in the admin's order, then the newest. */
function sortFeed(list) {
  return [...list].sort((a, b) => {
    if (Boolean(b.pinned) !== Boolean(a.pinned)) return b.pinned ? 1 : -1;
    if (a.pinned && b.pinned) {
      const pa = Number(a.pinOrder ?? a.pin_order) || 999;
      const pb = Number(b.pinOrder ?? b.pin_order) || 999;
      if (pa !== pb) return pa - pb;
    }
    const ta = ts(a.createdAt || a.published_at || a.created_at) || 0;
    const tb = ts(b.createdAt || b.published_at || b.created_at) || 0;
    return tb - ta;
  });
}

/* ---------------- engagement ---------------- */

function emptyStats() {
  return { delivered: 0, seen: 0, read: 0, clicked: 0, platforms: {}, langs: {} };
}

/** announcement_reads rows -> counts (only numbers leave this function). */
function aggregateReads(rows) {
  const by = new Map();
  for (const r of rows || []) {
    const id = String(r.announcement_id);
    const s = by.get(id) || emptyStats();
    s.delivered += 1;
    const seen = Boolean(r.seen_at || r.read_at);
    if (seen) s.seen += 1;
    if (r.read_at) s.read += 1;
    if (r.clicked_at) s.clicked += 1;
    const p = PLATFORMS.includes(r.platform) ? r.platform : null;
    if (p) {
      const ps = s.platforms[p] || { delivered: 0, seen: 0 };
      ps.delivered += 1;
      if (seen) ps.seen += 1;
      s.platforms[p] = ps;
    }
    const l = normLang(r.lang);
    if (l && seen) s.langs[l] = (s.langs[l] || 0) + 1;
    by.set(id, s);
  }
  return by;
}

function pct(n, d) {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : null;
}

/** One row of the stats CSV per announcement + per platform / language. */
function statsCsv(row, stats, audienceSize) {
  const s = stats || emptyStats();
  const esc = (v) => {
    const t = String(v == null ? "" : v);
    return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const lines = [["metric", "segment", "value"].join(",")];
  const push = (m, seg, v) => lines.push([m, seg, v].map(esc).join(","));
  push("title", "", row.title);
  push("status", "", statusOf(row));
  push("published_at", "", row.published_at || row.created_at || "");
  push("ends_at", "", row.ends_at || "");
  push("audience", "", audienceSize ?? "");
  push("delivered", "", s.delivered);
  push("seen", "", s.seen);
  push("read", "", s.read);
  push("clicked", "", s.clicked);
  push("seen_rate_pct", "", pct(s.seen, audienceSize || s.delivered) ?? "");
  push("click_rate_pct", "", pct(s.clicked, s.seen) ?? "");
  for (const p of PLATFORMS) if (s.platforms[p]) push("seen_by_platform", p, s.platforms[p].seen);
  for (const l of LOCALES) if (s.langs[l]) push("seen_by_language", l, s.langs[l]);
  return `${lines.join("\n")}\n`;
}

/* ---------------- templates ---------------- */

// Built-in templates (text in 7 languages) live in content/ so the API phrase scan skips them.
const { BUILTIN_TEMPLATES } = require("../../content/announcementTemplates");

const TEMPLATE_CATEGORIES = Object.freeze(["maintenance", "feature", "event", "security", "campaign", "rules", "custom"]);

const INTL_TAG = { tr: "tr-TR", en: "en-US", de: "de-DE", es: "es-ES", fr: "fr-FR", "pt-BR": "pt-BR", ru: "ru-RU" };

function fmtDateVar(iso, lang) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  try {
    return new Intl.DateTimeFormat(INTL_TAG[lang] || "en-US", { day: "numeric", month: "long", timeZone: "UTC" }).format(d);
  } catch {
    return `${m[3]}.${m[2]}`;
  }
}

function fmtPercent(n, lang) {
  const v = Math.max(0, Math.min(100, Number(n) || 0));
  try {
    return new Intl.NumberFormat(INTL_TAG[lang] || "en-US", { style: "percent", maximumFractionDigits: 0 }).format(v / 100);
  } catch {
    return `${v}%`;
  }
}

function plural(lang, n, forms) {
  if (lang === "ru") {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return forms[0];
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
    return forms[2];
  }
  if (lang === "tr") return forms[0];
  if (lang === "fr" || lang === "pt-BR") return n <= 1 ? forms[0] : forms[1];
  return n === 1 ? forms[0] : forms[1];
}

const DUR_WORDS = {
  tr: { h: ["saat"], m: ["dakika"], and: " " },
  en: { h: ["hour", "hours"], m: ["minute", "minutes"], and: " " },
  de: { h: ["Stunde", "Stunden"], m: ["Minute", "Minuten"], and: " " },
  es: { h: ["hora", "horas"], m: ["minuto", "minutos"], and: " y " },
  fr: { h: ["heure", "heures"], m: ["minute", "minutes"], and: " " },
  "pt-BR": { h: ["hora", "horas"], m: ["minuto", "minutos"], and: " e " },
  ru: { h: ["час", "часа", "часов"], m: ["минуту", "минуты", "минут"], and: " " },
};

function fmtDuration(minutes, lang) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const w = DUR_WORDS[lang] || DUR_WORDS.en;
  const h = Math.floor(total / 60);
  const m = total % 60;
  const hs = h ? `${h} ${plural(lang, h, w.h.length > 1 ? w.h : [w.h[0], w.h[0], w.h[0]])}` : "";
  const ms = m ? `${m} ${plural(lang, m, w.m.length > 1 ? w.m : [w.m[0], w.m[0], w.m[0]])}` : "";
  if (hs && ms) return `${hs}${w.and}${ms}`;
  return hs || ms || `0 ${plural(lang, 0, w.m.length > 1 ? w.m : [w.m[0], w.m[0], w.m[0]])}`;
}

function minutesBetween(start, end) {
  const p = (s) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ""));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const a = p(start);
  const b = p(end);
  if (a == null || b == null) return null;
  return b > a ? b - a : b + 1440 - a;
}

function templateByKey(key) {
  return BUILTIN_TEMPLATES.find((t) => t.key === key) || null;
}

/** Default variable values (date variables: the given day, `today` as yyyy-mm-dd). */
function templateDefaults(tpl, today) {
  const out = {};
  for (const v of tpl?.vars || []) {
    if (v.type === "date") out[v.id] = today;
    else if (v.default !== undefined) out[v.id] = v.default;
    else out[v.id] = "";
  }
  return out;
}

function renderVar(v, value, lang) {
  if (v.type === "date") return fmtDateVar(value, lang);
  if (v.type === "time") return /^\d{1,2}:\d{2}$/.test(String(value || "")) ? String(value).padStart(5, "0") : "";
  if (v.type === "duration") return fmtDuration(value, lang);
  if (v.type === "percent") return fmtPercent(value, lang);
  if (v.type === "choice") return v.options?.[value]?.[lang] || v.options?.[v.default]?.[lang] || "";
  return String(value || "").trim();
}

function fillText(str, tpl, values, lang) {
  return String(str || "")
    .replace(/\{([a-zA-Z_]+)\}/g, (m, id) => {
      const v = tpl.vars.find((x) => x.id === id);
      return v ? renderVar(v, values?.[id], lang) : m;
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;:])(?=\s|$)/g, (m, p) => (lang === "fr" && (p === ";" || p === ":") ? ` ${p}` : p))
    .replace(/^\s*[.,]\s*/, "")
    .trim();
}

/**
 * A built-in template filled in for every locale. Free-text variables are
 * inserted as typed, so the other languages come back marked "auto" (Kontrol).
 */
function fillTemplate(tpl, values = {}, { sourceLang = "tr", by = null, at = null } = {}) {
  const vals = { ...values };
  for (const v of tpl.vars) {
    if (v.type === "duration" && (vals[v.id] == null || vals[v.id] === "") && v.from) {
      const m = minutesBetween(vals[v.from[0]], vals[v.from[1]]);
      if (m != null) vals[v.id] = m;
    }
  }
  const freeText = tpl.vars.some((v) => v.type === "text" && String(vals[v.id] || "").trim());
  const out = { translations: {} };
  for (const lang of LOCALES) {
    const tx = tpl.text[lang];
    if (!tx) continue;
    const t = { title: fillText(tx.title, tpl, vals, lang).slice(0, LIMITS.title), content: fillText(tx.content, tpl, vals, lang).slice(0, LIMITS.content), cta_label: tx.cta || "" };
    if (lang === sourceLang) {
      out.title = t.title;
      out.content = t.content;
      out.ctaLabel = t.cta_label;
    } else {
      out.translations[lang] = { ...t, state: freeText ? "auto" : "ready", by, at };
    }
  }
  out.icon = tpl.icon;
  out.color = tpl.color;
  out.priority = tpl.priority;
  out.ctaUrl = tpl.ctaUrl || "";
  out.templateKey = tpl.key;
  out.values = vals;
  return out;
}

module.exports = {
  LOCALES,
  FALLBACK_LANG,
  PRIORITIES,
  STATUSES,
  PLATFORMS,
  COLORS,
  ICONS,
  LEGACY_EMOJI,
  LIMITS,
  DELETE_REASONS,
  END_REASONS,
  LEGACY_COLUMNS,
  BUILTIN_TEMPLATES,
  TEMPLATE_CATEGORIES,
  fail,
  normLang,
  platformOf,
  platformsFromSessions,
  hasEmoji,
  stripEmoji,
  iconOf,
  colorOf,
  baseStatus,
  statusOf,
  normalizeAudience,
  isEveryone,
  audienceKey,
  matchAudience,
  needsApproval,
  sanitizeCtaUrl,
  cleanTranslations,
  translationStates,
  localize,
  markStale,
  validateDraft,
  prePublishChecks,
  publicView,
  sortFeed,
  emptyStats,
  aggregateReads,
  pct,
  statsCsv,
  fmtDateVar,
  fmtDuration,
  fmtPercent,
  minutesBetween,
  templateByKey,
  templateDefaults,
  fillTemplate,
};
