"use strict";

/**
 * "Bug Avcısı" rules (owner request 27 Nov 2026), pure and selftested (model.selftest.cjs).
 *
 * - An admin confirms a feedback item as a real bug with a severity. The first report of a
 *   bug is the "first" credit; a later report of the same bug, linked to it, is "also found".
 * - A first credit grants the EXISTING special badge #11 "bughunter" (holders keep theirs); a
 *   visual / UI bug also #32 "glitch". The badge levels up in place by confirmed bugs (first
 *   credits plus the pre-feature history of today's holders): I at 1, II at 5, III at 15, shown
 *   as pips on the existing art. "Also found" credits are counted and shown apart and pay a
 *   smaller DesCoin bonus, but do not level the badge (owner can change ALSO_LEVELS).
 * - Severity (düşük / orta / yüksek / kritik) shows in the tooltip and the leaderboard.
 * - DesCoin bonus per confirmation, by severity (REWARDS), one ledger row per confirmation
 *   round: idempotency key "bug_bounty:<feedbackId>:<round>".
 */

const { put, ref } = require("../botText");

const SEVERITIES = Object.freeze(["low", "medium", "high", "critical"]);
const SEVERITY_RANK = Object.freeze({ low: 0, medium: 1, high: 2, critical: 3 });
const REWARDS = Object.freeze({
  first: Object.freeze({ low: 25, medium: 50, high: 100, critical: 250 }),
  also: Object.freeze({ low: 10, medium: 20, high: 40, critical: 100 }),
});
const TIERS = Object.freeze([
  Object.freeze({ level: 1, min: 1 }),
  Object.freeze({ level: 2, min: 5 }),
  Object.freeze({ level: 3, min: 15 }),
]);
const ROMAN = Object.freeze({ 1: "I", 2: "II", 3: "III" });
const BADGE_ID = "bughunter";
const GLITCH_BADGE_ID = "glitch";
/** Badge rows this feature granted carry this note, so an undo only takes back its own grants. */
const GRANT_NOTE = "bughunt";
const NOTE_MAX = 280;
const REASON_MIN = 3;
const REASON_MAX = 300;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Whether "also found" credits count towards the badge level (owner decision; off by default). */
const ALSO_LEVELS = false;

const n0 = (v) => Math.max(0, Number(v) || 0);

function isUuid(v) {
  return typeof v === "string" && UUID_RE.test(v);
}

function clip(s, n) {
  return String(s == null ? "" : s).slice(0, n);
}

/** Badge level for a count of credits: 0 (none), 1, 2 or 3. */
function levelFor(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  let level = 0;
  for (const t of TIERS) if (n >= t.min) level = t.level;
  return level;
}

/** The next tier above `count`: { level, min, left } or null at the top. */
function nextTier(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const t = TIERS.find((x) => x.min > n);
  return t ? { level: t.level, min: t.min, left: t.min - n } : null;
}

function rewardFor(credit, severity) {
  const table = REWARDS[credit === "also" ? "also" : "first"];
  return table[SEVERITIES.includes(severity) ? severity : "medium"];
}

function rewardKey(feedbackId, round, suffix = "") {
  return `bug_bounty:${feedbackId}:${Math.max(1, Number(round) || 1)}${suffix ? `:${suffix}` : ""}`;
}

/**
 * The admin's confirm body -> { severity, note, duplicateOf } or { error }.
 * A duplicate may leave the severity out: it then takes the root's severity.
 */
function sanitizeConfirm(body) {
  const b = body && typeof body === "object" ? body : {};
  const duplicateOf = b.duplicateOf == null || b.duplicateOf === "" ? null : String(b.duplicateOf);
  if (duplicateOf !== null && !isUuid(duplicateOf)) return { error: "BAD_DUPLICATE" };
  const severity = b.severity == null || b.severity === "" ? null : String(b.severity);
  if (severity !== null && !SEVERITIES.includes(severity)) return { error: "BAD_SEVERITY" };
  if (severity === null && duplicateOf === null) return { error: "BAD_SEVERITY" };
  const note = typeof b.note === "string" ? b.note.replace(/\s+/g, " ").trim().slice(0, NOTE_MAX) : "";
  return { severity, note: note || null, duplicateOf, visual: b.visual === true };
}

/** An undo reason: 3..300 characters, or null. */
function sanitizeReason(raw) {
  const r = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, REASON_MAX) : "";
  return r.length >= REASON_MIN ? r : null;
}

/** A confirmation row is live while it is not undone. */
function isLive(row) {
  return Boolean(row) && !row.undone_at;
}

/**
 * Per-person totals from feedback_bug_reports rows (live rows only).
 * Returns Map userId -> { first, also, critical, bySeverity, since, last, level }.
 */
function tally(rows) {
  const out = new Map();
  for (const r of rows || []) {
    if (!isLive(r) || !r.user_id) continue;
    const id = String(r.user_id);
    const cur = out.get(id) || { first: 0, also: 0, critical: 0, visual: 0, bySeverity: { low: 0, medium: 0, high: 0, critical: 0 }, since: null, last: null };
    if (r.credit === "also") cur.also += 1;
    else {
      cur.first += 1;
      if (r.severity === "critical") cur.critical += 1;
      if (SEVERITIES.includes(r.severity)) cur.bySeverity[r.severity] += 1;
      if (r.visual) cur.visual += 1;
    }
    const at = r.confirmed_at || null;
    if (at && (!cur.since || at < cur.since)) cur.since = at;
    if (at && (!cur.last || at > cur.last)) cur.last = at;
    out.set(id, cur);
  }
  for (const v of out.values()) v.level = levelFor(ALSO_LEVELS ? v.first + v.also : v.first);
  return out;
}

/**
 * Leaderboard rows: most confirmed bugs (first credits + pre-feature history), then also-found,
 * then criticals, then the earliest. `levels` (userId -> bug_hunter_levels row) adds the history.
 */
function leaderboard(rows, users = new Map(), { limit = 10, levels = new Map() } = {}) {
  const t = tally(rows);
  for (const [userId, lv] of levels) {
    if (!t.has(userId) && n0(lv?.legacy_count) > 0) t.set(userId, { first: 0, also: 0, critical: 0, visual: 0, bySeverity: { low: 0, medium: 0, high: 0, critical: 0 }, since: null, last: null });
  }
  const list = [...t.entries()].map(([userId, v]) => {
    const u = users.get(userId) || {};
    const lv = levels.get(userId) || null;
    const legacy = n0(lv?.legacy_count);
    const since = [v.since, lv?.legacy_since].filter(Boolean).sort()[0] || null;
    return {
      userId,
      username: u.username || null,
      displayName: u.display_name || u.displayName || null,
      avatarUrl: u.avatar_url || u.avatarUrl || null,
      first: v.first,
      legacy,
      bugs: v.first + legacy,
      also: v.also,
      critical: v.critical,
      visual: v.visual,
      bySeverity: v.bySeverity,
      level: levelFor(v.first + legacy + (ALSO_LEVELS ? v.also : 0)),
      since,
      last: v.last,
    };
  });
  list.sort((a, b) => b.bugs - a.bugs || b.also - a.also || b.critical - a.critical || String(a.since || "").localeCompare(String(b.since || "")));
  return list.slice(0, Math.max(1, Math.min(100, limit)));
}

/** Workspace totals for the card header: confirmed, also-found, criticals, paid DesCoin, people. */
function totals(rows) {
  let first = 0, also = 0, critical = 0, paid = 0, fixed = 0;
  const people = new Set();
  const bySeverity = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const r of rows || []) {
    if (!isLive(r)) continue;
    if (r.credit === "also") also += 1;
    else first += 1;
    if (r.severity === "critical" && r.credit !== "also") critical += 1;
    if (SEVERITIES.includes(r.severity)) bySeverity[r.severity] += 1;
    if (r.reward_state === "paid" || r.reward_state === "kept") paid += Number(r.reward) || 0;
    if (r.fixed_at) fixed += 1;
    if (r.user_id) people.add(String(r.user_id));
  }
  return { first, also, critical, paid, fixed, people: people.size, bySeverity };
}

/** The admin-facing shape of one confirmation row. */
function shapeConfirmation(r) {
  if (!r) return null;
  return {
    feedbackId: r.feedback_id,
    userId: r.user_id,
    severity: SEVERITIES.includes(r.severity) ? r.severity : "medium",
    credit: r.credit === "also" ? "also" : "first",
    duplicateOf: r.duplicate_of || null,
    note: r.note ? clip(r.note, NOTE_MAX) : null,
    visual: Boolean(r.visual),
    round: Number(r.round) || 1,
    reward: Number(r.reward) || 0,
    rewardState: r.reward_state || "none",
    levelAfter: r.level_after == null ? null : Number(r.level_after),
    confirmedBy: r.confirmed_by || null,
    confirmedAt: r.confirmed_at || null,
    live: isLive(r),
    undoneAt: r.undone_at || null,
    undoReason: r.undo_reason ? clip(r.undo_reason, REASON_MAX) : null,
    fixedAt: r.fixed_at || null,
  };
}

function newId() {
  return Math.random().toString(36).slice(2, 12);
}

/**
 * The thread line the sender reads ({ type: "bughunt" } in admin_replies). English text plus
 * i18n refs (lib/botText.js), so the admin panel, old clients and every language read it.
 *   event "confirmed": a first credit; "also": an also-found credit; "fixed": the fix shipped.
 * `badge` is "new" (first badge), "up" (level up), "more" (same level) or "none".
 */
function threadEntry({ event, severity, level = 0, badge = "none", count = 0, glitch = false, fixedNow = false, reward = 0, round = 1, adminUsername = null, at = new Date().toISOString() }) {
  const e = {
    id: newId(),
    type: "bughunt",
    event,
    severity: SEVERITIES.includes(severity) ? severity : null,
    level: Math.max(0, Math.min(3, Number(level) || 0)),
    badge,
    count: Math.max(0, Number(count) || 0),
    glitch: Boolean(glitch),
    reward: Math.max(0, Number(reward) || 0),
    round: Math.max(1, Number(round) || 1),
    badgeId: event === "fixed" || badge === "none" ? null : BADGE_ID,
    adminUsername: adminUsername ? clip(adminUsername, 40) : null,
    created_at: at,
  };
  const head = event === "fixed" ? "bot.bughunt.fixed" : event === "also" ? "bot.bughunt.also" : fixedNow ? "bot.bughunt.confirmedFixed" : "bot.bughunt.confirmed";
  put(e, "text", head);
  if (event !== "fixed") {
    const roman = ROMAN[e.level] || "I";
    const line = badge === "new" ? "bot.bughunt.badgeNew" : badge === "up" ? "bot.bughunt.badgeUp" : badge === "more" ? "bot.bughunt.badgeMore" : null;
    if (line) put(e, "badgeLine", line, { level: roman, count: e.count });
    if (glitch) put(e, "glitchLine", "bot.bughunt.badgeGlitch");
    if (e.reward > 0) put(e, "rewardLine", "bot.bughunt.reward", { amount: e.reward });
  }
  return e;
}

/** Notification copy for the bell list / push (bot.notify.*). */
function notifyCopy(entry) {
  if (entry.event === "fixed") return { titleKey: "bot.notify.bugFixedTitle", bodyKey: "bot.notify.bugFixedBody", vars: {} };
  if (entry.event === "also") return { titleKey: "bot.notify.bugAlsoTitle", bodyKey: "bot.notify.bugAlsoBody", vars: { amount: entry.reward } };
  const roman = ROMAN[entry.level] || "I";
  if (entry.badge === "up") return { titleKey: "bot.notify.bugConfirmedTitle", bodyKey: "bot.notify.bugLevelUpBody", vars: { level: roman } };
  if (entry.badge === "new") return { titleKey: "bot.notify.bugConfirmedTitle", bodyKey: "bot.notify.bugNewBadgeBody", vars: {} };
  return { titleKey: "bot.notify.bugConfirmedTitle", bodyKey: "bot.notify.bugMoreBody", vars: { count: entry.count } };
}

/** Confirmed bugs that level the badge: first credits plus the pre-feature history. */
function levelCount(row) {
  return n0(row?.first_count) + n0(row?.legacy_count) + (ALSO_LEVELS ? n0(row?.also_count) : 0);
}

/** What the profile tooltip reads: "12 gerçek bug buldu · Kasım 2026'dan beri" + severity mix. */
function badgeStats(row) {
  if (!row) return null;
  const bugs = n0(row.first_count) + n0(row.legacy_count);
  const sinces = [row.since, row.legacy_since].filter(Boolean).sort();
  return {
    level: Math.max(0, Math.min(3, levelFor(levelCount(row)))),
    bugs,
    also: n0(row.also_count),
    severity: { critical: n0(row.critical_count), high: n0(row.high_count), medium: n0(row.medium_count), low: n0(row.low_count) },
    since: sinces[0] || null,
  };
}

/** Admin-only system line in the thread for an undo (the sender never sees it). */
function undoLine({ adminUsername, reason, at = new Date().toISOString() }) {
  const who = adminUsername ? clip(adminUsername, 40) : ref("bot.feedback.adminFallback");
  return put({ id: newId(), type: "system", internal: true, bughunt: "undo", adminUsername: adminUsername || "admin", reason: clip(reason, REASON_MAX), created_at: at }, "text", "bot.bughunt.undone", { who, reason: clip(reason, REASON_MAX) });
}

module.exports = {
  SEVERITIES,
  SEVERITY_RANK,
  REWARDS,
  TIERS,
  ROMAN,
  BADGE_ID,
  GLITCH_BADGE_ID,
  GRANT_NOTE,
  NOTE_MAX,
  REASON_MIN,
  REASON_MAX,
  ALSO_LEVELS,
  isUuid,
  levelFor,
  nextTier,
  rewardFor,
  rewardKey,
  sanitizeConfirm,
  sanitizeReason,
  isLive,
  tally,
  leaderboard,
  totals,
  shapeConfirmation,
  threadEntry,
  notifyCopy,
  badgeStats,
  levelCount,
  undoLine,
};
