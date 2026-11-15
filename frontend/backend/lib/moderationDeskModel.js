"use strict";

/**
 * Moderasyon İşlem masası, pure rules (no database, no clock unless passed):
 * escalation steps, history row status, template / rule validation, message
 * variables. Tested by moderationDeskModel.selftest.cjs.
 */

const STEP_KINDS = Object.freeze(["warn", "timeout", "kick", "ban"]);
const SANCTION_TYPES = Object.freeze(["timeout", "ban", "kick"]);
const LIFT_REASONS = Object.freeze(["wrong_person", "apologized", "appeal_accepted", "too_long", "other"]);
const TEMPLATE_ACTIONS = Object.freeze(["timeout", "kick", "ban"]);
const HISTORY_TYPES = Object.freeze(["timeout", "ban", "kick", "unban", "untimeout", "timeout_extend", "ban_extend"]);
const MAX_STEPS = 6;

/** Suggested setup, added once to an empty table. */
/** Suggested setup, added once to an empty table. Empty name and message = shown in the admin's language. */
const SUGGESTED_TEMPLATES = Object.freeze([
  { name: "", action: "timeout", category: "spam", preset_id: "1h", duration_seconds: 3600, message: null },
  { name: "", action: "timeout", category: "language", preset_id: "30m", duration_seconds: 1800, message: null },
  { name: "", action: "timeout", category: "harassment", preset_id: "24h", duration_seconds: 86400, message: null },
  { name: "", action: "timeout", category: "raid", preset_id: "7d", duration_seconds: 7 * 86400, message: null },
]);

const SUGGESTED_RULE = Object.freeze({
  name: "",
  categories: ["language", "harassment", "spam", "hate_speech"],
  window_days: 30,
  steps: [
    { kind: "warn", seconds: null },
    { kind: "timeout", seconds: 30 * 60 },
    { kind: "ban", seconds: 24 * 3600 },
    { kind: "ban", seconds: 7 * 86400 },
  ],
  ban_suggest_only: true,
  discount_early_lift: true,
});

/** Comparable weight of a step: kind first, then length (a permanent ban is the heaviest). */
function stepWeight(step) {
  if (!step) return -1;
  const k = STEP_KINDS.indexOf(step.kind);
  if (k < 0) return -1;
  const secs = step.seconds == null ? (step.kind === "ban" ? 1e12 : 0) : Number(step.seconds) || 0;
  return k * 1e13 + secs;
}

/** Step for the n-th violation (1-based); past the ladder the last step repeats. */
function stepFor(steps, nth) {
  const list = Array.isArray(steps) ? steps.filter((s) => STEP_KINDS.includes(s?.kind)) : [];
  if (!list.length || !(nth >= 1)) return null;
  return list[Math.min(Math.floor(nth), list.length) - 1];
}

/**
 * Sanctions that count for a rule: its categories, inside its window, and
 * (when discount_early_lift) not lifted early with discount.
 */
function countingSanctions(rows, rule, now) {
  const cats = new Set(Array.isArray(rule?.categories) ? rule.categories : []);
  const since = now - (Number(rule?.window_days) || 30) * 86400000;
  return (rows || []).filter((r) => {
    if (!SANCTION_TYPES.includes(r.action_type)) return false;
    if (!cats.has(r.category)) return false;
    if (Date.parse(r.created_at) < since) return false;
    if (rule.discount_early_lift !== false && r.meta && r.meta.earlyLift && r.meta.discount !== false) return false;
    return true;
  });
}

/**
 * The strongest suggestion among rules for one user.
 * @param {object[]} rules enabled rules
 * @param {object[]} rows the user's moderation_actions (any window)
 * @param {{ category: string, action?: string, seconds?: number|null, now: number, includeCurrent?: boolean }} opts
 *   includeCurrent = rows already hold the sanction being judged (after it was saved)
 */
function escalationFor(rules, rows, { category, action, seconds = null, now, includeCurrent = false }) {
  let best = null;
  for (const rule of rules || []) {
    if (rule.enabled === false || rule.archived_at) continue;
    if (!Array.isArray(rule.categories) || !rule.categories.includes(category)) continue;
    const prior = countingSanctions(rows, rule, now).length;
    const nth = includeCurrent ? Math.max(1, prior) : prior + 1;
    const step = stepFor(rule.steps, nth);
    if (!step) continue;
    const chosen = action ? { kind: action, seconds } : null;
    const stronger = chosen ? stepWeight(step) > stepWeight(chosen) : true;
    const cand = { ruleId: rule.id, ruleName: rule.name, nth, step, stronger, windowDays: Number(rule.window_days) || 30, suggestOnly: step.kind === "ban" && rule.ban_suggest_only !== false };
    if (!best || stepWeight(step) > stepWeight(best.step)) best = cand;
  }
  return best;
}

/** Clean an incoming rule; throws a 400-shaped error. */
function validateRule(input, knownCategories) {
  const body = input || {};
  const fail = (msg, code) => {
    const err = new Error(msg);
    err.status = 400;
    err.code = code;
    throw err;
  };
  const name = String(body.name || "").trim().slice(0, 80);
  const cats = [...new Set((Array.isArray(body.categories) ? body.categories : []).map(String))].filter((c) => !knownCategories || knownCategories.has(c));
  if (!cats.length) fail("Pick at least one category.", "RULE_CATEGORIES");
  const windowDays = Math.max(1, Math.min(365, Math.floor(Number(body.windowDays ?? body.window_days) || 30)));
  const steps = (Array.isArray(body.steps) ? body.steps : []).slice(0, MAX_STEPS).map((s) => {
    const kind = STEP_KINDS.includes(s?.kind) ? s.kind : null;
    if (!kind) fail("Unknown step.", "RULE_STEP");
    let secs = s.seconds == null ? null : Math.floor(Number(s.seconds));
    if (kind === "timeout" && !(secs >= 60)) fail("A timeout step needs a length of at least a minute.", "RULE_STEP");
    if (kind === "warn" || kind === "kick") secs = null;
    if (kind === "ban" && secs != null && !(secs >= 3600)) secs = null;
    return { kind, seconds: secs };
  });
  if (!steps.length) fail("Add at least one step.", "RULE_STEPS");
  return {
    name,
    enabled: body.enabled !== false,
    categories: cats,
    window_days: windowDays,
    steps,
    ban_suggest_only: true, // owner rule: bans are always confirmed in BanDialog
    discount_early_lift: body.discountEarlyLift !== false && body.discount_early_lift !== false,
  };
}

function validateTemplate(input, knownCategories) {
  const body = input || {};
  const fail = (msg, code) => {
    const err = new Error(msg);
    err.status = 400;
    err.code = code;
    throw err;
  };
  const name = String(body.name || "").trim().slice(0, 60);
  const action = TEMPLATE_ACTIONS.includes(body.action) ? body.action : null;
  if (!action) fail("Unknown action.", "TEMPLATE_ACTION");
  const category = String(body.category || "");
  if (!category || (knownCategories && !knownCategories.has(category))) fail("Unknown category.", "TEMPLATE_CATEGORY");
  const secs = body.durationSeconds == null ? null : Math.floor(Number(body.durationSeconds));
  if (action === "timeout" && !(secs >= 60)) fail("A timeout template needs a length.", "TEMPLATE_DURATION");
  return {
    name,
    action,
    category,
    preset_id: body.presetId ? String(body.presetId).slice(0, 20) : null,
    duration_seconds: action === "kick" ? null : secs,
    message: body.message ? String(body.message).slice(0, 500) : null,
  };
}

/**
 * Status of a history row: "active", "ended", "lifted" (early), or for bans an
 * appeal state ("appeal_pending", "appeal_rejected", "appeal_accepted"); kicks
 * and lifts are "done".
 * @param {object} row moderation_actions row
 * @param {{ now: number, laterLift?: object|null, currentlyActive?: boolean, appeal?: string|null }} ctx
 */
function historyStatus(row, { now, laterLift = null, currentlyActive = false, appeal = null }) {
  const type = row.action_type;
  if (type !== "timeout" && type !== "ban") return "done";
  if (row.revoked_at || laterLift) return "lifted";
  if (type === "ban" && appeal) {
    if (appeal === "pending") return "appeal_pending";
    if (appeal === "rejected") return "appeal_rejected";
    if (appeal === "accepted") return "appeal_accepted";
  }
  const ends = row.expires_at ? Date.parse(row.expires_at) : null;
  if (ends != null && ends <= now) return "ended";
  return currentlyActive ? "active" : "ended";
}

/** Day buckets for the history chart: [{ day: "2026-11-14", timeout, ban, kick }] oldest first. */
function dailyBuckets(rows, { days, now }) {
  const out = [];
  const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
  const index = new Map();
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = dayKey(now - i * 86400000);
    const b = { day: key, timeout: 0, ban: 0, kick: 0 };
    index.set(key, b);
    out.push(b);
  }
  for (const r of rows || []) {
    const at = Date.parse(r.created_at ?? r.createdAt);
    if (!Number.isFinite(at)) continue;
    const b = index.get(dayKey(at));
    if (b && (r.action_type === "timeout" || r.action_type === "ban" || r.action_type === "kick")) b[r.action_type] += 1;
  }
  return out;
}

function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r;]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s;
}

/** CSV of history rows (formula-safe cells). */
function historyCsv(rows) {
  const head = ["created_at", "action", "target", "category", "duration_seconds", "actor", "status", "message"];
  const lines = [head.join(",")];
  for (const r of rows || []) {
    lines.push([r.createdAt, r.action, r.target?.username, r.category, r.durationSeconds, r.actor?.username || (r.auto ? "auto" : ""), r.status, r.message].map(csvCell).join(","));
  }
  return lines.join("\n");
}

module.exports = {
  STEP_KINDS,
  SANCTION_TYPES,
  LIFT_REASONS,
  TEMPLATE_ACTIONS,
  HISTORY_TYPES,
  SUGGESTED_TEMPLATES,
  SUGGESTED_RULE,
  stepWeight,
  stepFor,
  countingSanctions,
  escalationFor,
  validateRule,
  validateTemplate,
  historyStatus,
  dailyBuckets,
  historyCsv,
  csvCell,
};
