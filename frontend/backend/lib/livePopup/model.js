"use strict";

/**
 * Canlı popup (admin remake, Draft B "Kontrol merkezi", Nov 2026): pure helpers
 * shared by the engine, the admin routes and the selftest. No I/O here.
 *
 *  - content: validate / clip a popup (title, body, tone, icon, auto-close,
 *    acknowledgement, button) and turn it into the `admin:popup` wire payload;
 *  - audience: rule list (specific people, a server's members, Descall+,
 *    platform, language, account age, in voice now, visible only), cleaned and
 *    matched against a connected candidate;
 *  - receipts: status of one recipient, campaign stats (funnel, seen speed,
 *    platform / language split, live event feed), table filters, CSV.
 */

const { isVisibleStatus } = require("../presenceRoster");

const SEVERITIES = ["info", "success", "warning", "urgent"];
// Icon ids the panel picks; `emoji` stays on the wire for clients that predate `icon`.
const ICON_EMOJI = Object.freeze({
  megaphone: "\u{1F4E2}",
  bell: "\u{1F514}",
  chat: "\u{1F4AC}",
  party: "\u{1F389}",
  check: "✅",
  warning: "⚠️",
  wrench: "\u{1F527}",
  lock: "\u{1F512}",
  siren: "\u{1F6A8}",
});
const ICONS = Object.keys(ICON_EMOJI);
const DURATIONS = [0, 10_000, 30_000, 60_000, 120_000];
const PLATFORMS = ["desktop", "web", "ios", "android"];
const LANGS = ["tr", "en", "de", "es", "fr", "pt-BR", "ru"];
const RULE_TYPES = ["users", "server", "premium", "platform", "language", "accountAge", "voice", "visibility"];
const RECALL_MODES = ["silent", "note", "edited"];
const RECEIPT_KINDS = ["delivered", "seen", "clicked", "acked", "dismissed"];
const FILTERS = ["all", "seen", "acked", "clicked", "open", "dismissed", "missed"];
const MAX_TITLE = 80;
const MAX_BODY = 800;
const MAX_CTA_LABEL = 40;
const MAX_CTA_URL = 300;
const MAX_RULE_USERS = 200;
const MAX_NOTE = 300;
const MIN_NOTE = 5;
const MAX_CORRECTION = 200;
const MAX_TEMPLATE_NAME = 60;
const LIVE_WINDOW_MS = 24 * 60 * 60 * 1000;
const DAILY_LIMIT = 10;
const SPARK_BUCKETS = 12;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CTA_HOSTS = new Set(["descall.com", "www.descall.com"]);

const isUuid = (v) => UUID.test(String(v || ""));
const clip = (v, max) => String(v ?? "").replace(/\s+$/g, "").replace(/^\s+/g, "").slice(0, max);
const ms = (iso) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
};

/** English fallback per error code (the panel shows livePopup.err.<code> in the admin's language). */
const MESSAGES = Object.freeze({
  TITLE_REQUIRED: "Title is required.",
  BODY_REQUIRED: "Message body is required.",
  TITLE_TOO_LONG: "Title is too long.",
  BODY_TOO_LONG: "Message is too long.",
  BAD_CTA_URL: "The button link must be a Descall address or an in-app path.",
  CTA_URL_REQUIRED: "Add a link for the button or clear its label.",
  CTA_LABEL_REQUIRED: "Add a label for the button.",
  NOTE_REQUIRED: "Write a short reason (it goes to the audit log).",
  CORRECTION_REQUIRED: "Write the short correction people will see.",
  BAD_SCHEDULE: "Pick a valid time.",
  SCHEDULE_PAST: "Pick a time at least a minute from now.",
  SCHEDULE_FAR: "Pick a time within 60 days.",
  NAME_REQUIRED: "Give the template a name.",
  BAD_USER: "Invalid user.",
  NO_DEVICE: "None of your devices is connected right now.",
  TEMPLATES_UNAVAILABLE: "Saved templates are not set up yet.",
  TEMPLATE_NOT_FOUND: "Template not found.",
  EXEMPTIONS_UNAVAILABLE: "Exemptions are not set up yet.",
});

function fail(code) {
  return { ok: false, error: MESSAGES[code] || code, code: code === "TEMPLATE_NOT_FOUND" ? "NOT_FOUND" : code };
}

/* ---------------- content ---------------- */

function cleanCtaUrl(raw) {
  let s = String(raw || "").trim();
  if (!s) return { ok: true, url: "" };
  if (s.startsWith("/") && !s.startsWith("//") && !s.includes("\\")) return { ok: true, url: s.slice(0, MAX_CTA_URL) };
  // "descall.com/durum" as typed in the panel: https is implied.
  if (/^(www\.)?([a-z0-9-]+\.)*descall\.com(\/|$|\?)/i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase();
    if (u.protocol === "https:" && (CTA_HOSTS.has(host) || host.endsWith(".descall.com"))) {
      return { ok: true, url: u.toString().slice(0, MAX_CTA_URL) };
    }
  } catch {
    /* invalid */
  }
  return { ok: false };
}

/**
 * @returns {{ok: true, content: object} | {ok: false, error: string, code: string}}
 */
function normalizeContent(input = {}) {
  const rawTitle = String(input.title ?? "").trim();
  const rawBody = String(input.body ?? "").trim();
  if (!rawTitle) return fail("TITLE_REQUIRED");
  if (!rawBody) return fail("BODY_REQUIRED");
  if (rawTitle.length > MAX_TITLE) return fail("TITLE_TOO_LONG");
  if (rawBody.length > MAX_BODY) return fail("BODY_TOO_LONG");
  const severity = SEVERITIES.includes(String(input.severity)) ? String(input.severity) : "info";
  const icon = ICONS.includes(String(input.icon)) ? String(input.icon) : defaultIcon(severity);
  let durationMs = Number(input.durationMs);
  if (!DURATIONS.includes(durationMs)) durationMs = 0;
  const requireAck = input.requireAck == null ? severity === "urgent" : Boolean(input.requireAck);
  // A popup that needs an OK never closes by itself.
  if (requireAck) durationMs = 0;
  let ctaLabel = clip(input.ctaLabel, MAX_CTA_LABEL);
  const cta = cleanCtaUrl(input.ctaUrl);
  if (!cta.ok) return fail("BAD_CTA_URL");
  if (ctaLabel && !cta.url) return fail("CTA_URL_REQUIRED");
  if (cta.url && !ctaLabel) return fail("CTA_LABEL_REQUIRED");
  return {
    ok: true,
    content: {
      title: rawTitle,
      body: rawBody,
      severity,
      icon,
      durationMs,
      requireAck,
      autoResolve: Boolean(input.autoResolve),
      ctaLabel: ctaLabel || "",
      ctaUrl: cta.url || "",
    },
  };
}

function defaultIcon(severity) {
  return { info: "megaphone", success: "party", warning: "wrench", urgent: "siren" }[severity] || "megaphone";
}

/** Audit / recall note: required, trimmed, 5..300 characters. */
function cleanNote(raw, { min = MIN_NOTE, max = MAX_NOTE } = {}) {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (s.length < min) return fail("NOTE_REQUIRED");
  return { ok: true, note: s.slice(0, max) };
}

/** `admin:popup` payload for one campaign row (snake_case DB shape). */
function toWirePopup(c, { test = false } = {}) {
  return {
    id: c.id,
    campaignId: c.id,
    title: c.title,
    body: c.body,
    severity: c.severity,
    icon: c.icon,
    emoji: ICON_EMOJI[c.icon] || ICON_EMOJI.megaphone,
    durationMs: c.require_ack ? 0 : Number(c.duration_ms) || 0,
    requireAck: Boolean(c.require_ack),
    ctaLabel: c.cta_label || "",
    ctaUrl: c.cta_url || "",
    at: c.sent_at || new Date().toISOString(),
    from: { id: c.created_by || null, username: c.created_by_username || "admin" },
    track: !test,
    test: Boolean(test),
  };
}

/* ---------------- audience ---------------- */

function uniq(list) {
  return [...new Set(list)];
}

/** Clean a rule list from the panel. Unknown or empty rules are dropped; one rule per type (last wins). */
function normalizeAudience(input) {
  const raw = Array.isArray(input?.rules) ? input.rules : Array.isArray(input) ? input : [];
  const byType = new Map();
  for (const r of raw.slice(0, 16)) {
    const type = String(r?.type || "");
    if (!RULE_TYPES.includes(type)) continue;
    let rule = null;
    if (type === "users") {
      const people = (Array.isArray(r.users) ? r.users : (Array.isArray(r.ids) ? r.ids : []).map((id) => ({ id })))
        .map((u) => ({ id: String(u?.id || "").toLowerCase(), username: clip(u?.username, 40) || null }))
        .filter((u) => isUuid(u.id));
      const seen = new Set();
      const users = [];
      for (const u of people) {
        if (seen.has(u.id)) continue;
        seen.add(u.id);
        users.push(u);
        if (users.length >= MAX_RULE_USERS) break;
      }
      if (users.length) rule = { type, users };
    } else if (type === "server") {
      const serverId = String(r.serverId || "").toLowerCase();
      if (isUuid(serverId)) rule = { type, serverId, name: clip(r.name, 80) || null };
    } else if (type === "premium") {
      rule = { type, value: r.value === "non" ? "non" : "member" };
    } else if (type === "platform") {
      const values = uniq((r.values || []).map(String)).filter((v) => PLATFORMS.includes(v));
      if (values.length) rule = { type, values: PLATFORMS.filter((p) => values.includes(p)) };
    } else if (type === "language") {
      const values = uniq((r.values || []).map((v) => normLang(v))).filter(Boolean);
      if (values.length) rule = { type, values: LANGS.filter((l) => values.includes(l)) };
    } else if (type === "accountAge") {
      const days = Math.round(Number(r.days));
      if (Number.isFinite(days) && days >= 1 && days <= 3650) rule = { type, op: r.op === "newer" ? "newer" : "older", days };
    } else if (type === "voice") {
      rule = { type };
    } else if (type === "visibility") {
      rule = { type, value: "visible" };
    }
    if (rule) {
      byType.delete(type);
      byType.set(type, rule);
    }
  }
  return { rules: [...byType.values()] };
}

function ruleOf(audience, type) {
  return (audience?.rules || []).find((r) => r.type === type) || null;
}

/**
 * Does one connected person match every rule?
 * @param {{id: string, status?: string, platforms?: string[], lang?: string|null, createdAt?: string|null, plan?: string|null, inVoice?: boolean}} c
 * @param {{rules: object[]}} audience
 * @param {{serverMembers?: Set<string>, now?: number}} ctx
 */
function matchCandidate(c, audience, ctx = {}) {
  const now = ctx.now ?? Date.now();
  for (const r of audience?.rules || []) {
    if (r.type === "users" && !r.users.some((u) => u.id === String(c.id).toLowerCase())) return false;
    if (r.type === "server" && !(ctx.serverMembers && ctx.serverMembers.has(String(c.id)))) return false;
    if (r.type === "premium" && (r.value === "member") !== Boolean(c.plan)) return false;
    if (r.type === "platform" && !(c.platforms || []).some((p) => r.values.includes(p))) return false;
    if (r.type === "language" && !r.values.includes(c.lang)) return false;
    if (r.type === "accountAge") {
      const created = ms(c.createdAt);
      if (created == null) return false;
      const age = (now - created) / 86400000;
      if (r.op === "older" ? age < r.days : age >= r.days) return false;
    }
    if (r.type === "voice" && !c.inVoice) return false;
    if (r.type === "visibility" && !isVisibleStatus(c.status)) return false;
  }
  return true;
}

/** Socket handshake `auth.app` -> platform bucket. */
function platformOf(app) {
  const a = String(app || "").toLowerCase();
  if (a === "electron" || a === "desktop") return "desktop";
  if (a === "ios") return "ios";
  if (a === "android") return "android";
  return "web";
}

/** First platform in a stable order (desktop > web > ios > android) or, with a platform rule, the first allowed one. */
function primaryPlatform(platforms, allowed) {
  const list = (platforms || []).filter((p) => !allowed || allowed.includes(p));
  for (const p of PLATFORMS) if (list.includes(p)) return p;
  return (platforms || [])[0] || null;
}

function normLang(raw) {
  const s = String(raw || "").trim().replace("_", "-");
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === "pt-br" || lower === "pt") return "pt-BR";
  const two = lower.slice(0, 2);
  return LANGS.includes(two) ? two : null;
}

/* ---------------- receipts ---------------- */

/**
 * acked | clicked | dismissed | open (seen, still on screen) | seen (closed by a recall
 * or another device) | unseen (delivered, not seen yet) | sending (sent, the client has
 * not confirmed yet) | missed (not delivered: offline, left, connection).
 */
function receiptStatus(r) {
  if (!r) return "missed";
  if (r.acked_at) return "acked";
  if (r.clicked_at) return "clicked";
  if (r.dismissed_at) return "dismissed";
  if (!r.delivered_at) return r.missed_at ? "missed" : "sending";
  if (r.seen_at) return r.closed_at ? "seen" : "open";
  return "unseen";
}

/** Still on the recipient's screen (or in their queue): a recall closes these. */
function isOpen(r) {
  return Boolean(r?.delivered_at && !r.acked_at && !r.dismissed_at && !r.closed_at);
}

function matchesFilter(r, filter) {
  const s = receiptStatus(r);
  switch (filter) {
    case "seen":
      return Boolean(r.seen_at);
    case "acked":
      return Boolean(r.acked_at);
    case "clicked":
      return Boolean(r.clicked_at);
    case "open":
      return s === "open";
    case "dismissed":
      return Boolean(r.dismissed_at) && !r.acked_at && !r.clicked_at;
    case "missed":
      return s === "missed";
    default:
      return true;
  }
}

function filterCounts(receipts) {
  const out = Object.fromEntries(FILTERS.map((f) => [f, 0]));
  for (const r of receipts) for (const f of FILTERS) if (matchesFilter(r, f)) out[f] += 1;
  return out;
}

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);

/** Latest thing that happened to one recipient, for the live feed. */
function latestEvent(r) {
  const cand = [
    ["acked", r.acked_at],
    ["clicked", r.clicked_at],
    ["dismissed", r.dismissed_at],
    ["seen", r.seen_at],
    ["delivered", r.delivered_at],
  ]
    .filter(([, at]) => at)
    .sort((a, b) => ms(b[1]) - ms(a[1]));
  if (cand.length) {
    const [kind, at] = cand[0];
    return { kind, at, open: kind === "seen" ? isOpen(r) : false };
  }
  if (r.missed_at) return { kind: "missed", at: r.missed_at, reason: r.missed_reason || "offline", pending: Boolean(r.pending_login) };
  return null;
}

/**
 * Funnel + seen speed + platform / language split + live feed for one campaign.
 * @param {object[]} receipts snake_case rows
 * @param {{sentAt?: string|null, now?: number, ctaUrl?: string}} opts
 */
function computeStats(receipts, { sentAt = null, now = Date.now(), ctaUrl = "" } = {}) {
  const list = Array.isArray(receipts) ? receipts : [];
  const s = {
    targeted: list.length,
    delivered: 0,
    seen: 0,
    acked: 0,
    clicked: 0,
    dismissed: 0,
    missed: 0,
    open: 0,
    unseen: 0,
    closable: 0,
    pendingLogin: 0,
  };
  const platforms = {};
  const languages = {};
  let seenSum = 0;
  let seenN = 0;
  const spark = new Array(SPARK_BUCKETS).fill(0);
  const start = ms(sentAt);
  for (const r of list) {
    const st = receiptStatus(r);
    if (r.delivered_at) s.delivered += 1;
    if (r.seen_at) s.seen += 1;
    if (r.acked_at) s.acked += 1;
    if (r.clicked_at) s.clicked += 1;
    if (r.dismissed_at && !r.acked_at && !r.clicked_at) s.dismissed += 1;
    if (st === "missed") s.missed += 1;
    if (st === "open") s.open += 1;
    if (st === "unseen") s.unseen += 1;
    if (isOpen(r)) s.closable += 1;
    if (st === "missed" && r.pending_login) s.pendingLogin += 1;
    const p = PLATFORMS.includes(r.platform) ? r.platform : "web";
    platforms[p] = platforms[p] || { n: 0, seen: 0 };
    platforms[p].n += 1;
    if (r.seen_at) platforms[p].seen += 1;
    const l = normLang(r.language) || "other";
    languages[l] = languages[l] || { n: 0, seen: 0 };
    languages[l].n += 1;
    if (r.seen_at) languages[l].seen += 1;
    const seenAt = ms(r.seen_at);
    const delAt = ms(r.delivered_at);
    if (seenAt != null && delAt != null && seenAt >= delAt) {
      seenSum += seenAt - delAt;
      seenN += 1;
    }
    if (seenAt != null && start != null && seenAt >= start) {
      const b = Math.floor((seenAt - start) / 60000);
      if (b < SPARK_BUCKETS) spark[b] += 1;
    }
  }
  const ackers = list
    .filter((r) => r.acked_at)
    .sort((a, b) => ms(b.acked_at) - ms(a.acked_at))
    .map((r) => ({ id: r.user_id, username: r.username || null }));
  const events = list
    .map((r) => {
      const ev = latestEvent(r);
      return ev ? { userId: r.user_id, username: r.username || null, platform: r.platform || null, language: normLang(r.language), ...ev } : null;
    })
    .filter(Boolean)
    .sort((a, b) => ms(b.at) - ms(a.at))
    .slice(0, 12)
    .map((e) => (e.kind === "clicked" ? { ...e, url: ctaUrl || "" } : e));
  return {
    ...s,
    pct: {
      delivered: pct(s.delivered, s.targeted),
      seen: pct(s.seen, s.targeted),
      acked: pct(s.acked, s.targeted),
      clicked: pct(s.clicked, s.targeted),
      missed: pct(s.missed, s.targeted),
      seenOfDelivered: pct(s.seen, s.delivered),
      clickOfDelivered: pct(s.clicked, s.delivered),
    },
    avgSeenMs: seenN ? Math.round(seenSum / seenN) : null,
    spark,
    platforms: PLATFORMS.map((p) => ({ id: p, n: platforms[p]?.n || 0, seen: platforms[p]?.seen || 0, pct: pct(platforms[p]?.seen || 0, platforms[p]?.n || 0) })),
    languages: Object.entries(languages)
      .map(([id, v]) => ({ id, n: v.n, seen: v.seen, pct: pct(v.seen, v.n) }))
      .sort((a, b) => b.n - a.n),
    recentAckers: ackers.slice(0, 3),
    ackersTotal: ackers.length,
    events,
    elapsedMs: start != null ? Math.max(0, now - start) : null,
  };
}

/** Counts kept on the campaign row (history list without reading every receipt). */
function statsSnapshot(stats) {
  const keys = ["targeted", "delivered", "seen", "acked", "clicked", "dismissed", "missed", "open", "pendingLogin"];
  return Object.fromEntries(keys.map((k) => [k, Number(stats?.[k]) || 0]));
}

const CSV_COLS = ["username", "user_id", "platform", "language", "status", "delivered_at", "seen_at", "clicked_at", "acked_at", "dismissed_at", "missed_reason", "pending_login", "resend_count"];

function csvCell(v) {
  let s = v == null ? "" : String(v);
  // Spreadsheet formula injection: a leading = + - @ is read as text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function receiptsCsv(receipts) {
  const lines = [CSV_COLS.join(",")];
  for (const r of receipts || []) {
    const row = { ...r, status: receiptStatus(r), language: normLang(r.language) || r.language || "" };
    lines.push(CSV_COLS.map((k) => csvCell(row[k])).join(","));
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

/* ---------------- recall ---------------- */

function normalizeRecall(input = {}) {
  const mode = RECALL_MODES.includes(input.mode) ? input.mode : "silent";
  const reason = cleanNote(input.reason);
  if (!reason.ok) return reason;
  const out = { ok: true, mode, reason: reason.note, note: "", edited: null };
  if (mode === "note") {
    const note = String(input.note ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_CORRECTION);
    if (!note) return fail("CORRECTION_REQUIRED");
    out.note = note;
  }
  if (mode === "edited") {
    const c = normalizeContent(input.edited || {});
    if (!c.ok) return c;
    out.edited = c.content;
  }
  return out;
}

/** Start of "today" in Turkey (UTC+3, no DST), where the daily limit resets. */
function dayStartIso(now = Date.now()) {
  const shifted = new Date(now + 3 * 3600000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - 3 * 3600000).toISOString();
}

module.exports = {
  MESSAGES,
  fail,
  SEVERITIES,
  ICONS,
  ICON_EMOJI,
  DURATIONS,
  PLATFORMS,
  LANGS,
  RULE_TYPES,
  RECALL_MODES,
  RECEIPT_KINDS,
  FILTERS,
  MAX_TITLE,
  MAX_BODY,
  MAX_RULE_USERS,
  MAX_TEMPLATE_NAME,
  LIVE_WINDOW_MS,
  DAILY_LIMIT,
  SPARK_BUCKETS,
  isUuid,
  cleanCtaUrl,
  normalizeContent,
  defaultIcon,
  cleanNote,
  toWirePopup,
  normalizeAudience,
  ruleOf,
  matchCandidate,
  platformOf,
  primaryPlatform,
  normLang,
  receiptStatus,
  isOpen,
  matchesFilter,
  filterCounts,
  latestEvent,
  computeStats,
  statsSnapshot,
  receiptsCsv,
  normalizeRecall,
  dayStartIso,
};
