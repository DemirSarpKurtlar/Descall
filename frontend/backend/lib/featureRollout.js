"use strict";

/**
 * Feature flag rollout (Sistem page, Nov 2026, owner pick Draft A "Kontrol merkezi").
 *
 * A flag in system_settings.config.featureFlags is either
 *   - a plain boolean (every flag before Nov 2026; still valid), or
 *   - a rule { mode, percent, platforms, staff }:
 *       mode       "off" | "staff" | "rollout" | "all"
 *       percent    0-100, used by "rollout" (stable per user id, see bucketOf)
 *       platforms  subset of web | electron | ios | android; empty = every platform
 *       staff      user ids that always get the flag ("Her zaman açık (ekip)"), max 50
 *
 * The same algorithm lives in src/lib/featureRollout.js for the client-side check;
 * backend/test/featureRollout.test.cjs proves both give the same answer.
 */

const MODES = Object.freeze(["off", "staff", "rollout", "all"]);
const PLATFORMS = Object.freeze(["web", "electron", "ios", "android"]);
const STAFF_MAX = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 32-bit FNV-1a over the UTF-16 code units (same in Node and every browser). */
function fnv1a(text) {
  let h = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Stable 0-99 bucket for this user and flag (a new flag reshuffles, a refresh never does). */
function bucketOf(flagKey, userId) {
  if (!userId) return null;
  return fnv1a(`${flagKey}:${String(userId).toLowerCase()}`) % 100;
}

function isRule(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clampPercent(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function cleanPlatforms(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const p of list) {
    const v = String(p || "").toLowerCase();
    if (PLATFORMS.includes(v) && !out.includes(v)) out.push(v);
  }
  return PLATFORMS.filter((p) => out.includes(p));
}

function cleanStaff(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const id of list) {
    const v = String(id || "").trim().toLowerCase();
    if (UUID_RE.test(v) && !out.includes(v)) out.push(v);
    if (out.length >= STAFF_MAX) break;
  }
  return out;
}

/** Known fields only. A boolean stays a boolean. */
function normalizeRule(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (!isRule(value)) return Boolean(fallback);
  const mode = MODES.includes(value.mode) ? value.mode : "off";
  return {
    mode,
    // Off and staff keep the percent so switching a paused rollout back on resumes it.
    percent: mode === "all" ? 100 : clampPercent(value.percent),
    platforms: cleanPlatforms(value.platforms),
    staff: cleanStaff(value.staff),
  };
}

/** A boolean or rule as a full rule (the editor always works on rules). */
function toRule(value, defaultOn = false) {
  if (isRule(value)) return normalizeRule(value);
  const on = typeof value === "boolean" ? value : Boolean(defaultOn);
  return { mode: on ? "all" : "off", percent: on ? 100 : 0, platforms: [], staff: [] };
}

/** The plain boolean an equivalent rule reduces to, or null when it needs a user. */
function simpleValue(rule) {
  if (typeof rule === "boolean") return rule;
  const r = normalizeRule(rule);
  if (r.mode === "off" && !r.staff.length) return false;
  if (r.mode === "all" && !r.platforms.length) return true;
  return null;
}

/** An unknown platform (anonymous /api/features) is not excluded; a known one must be listed. */
/**
 * How a rule is stored: the plain boolean when it means exactly that (older readers
 * understand it), otherwise the rule. A paused rollout (off with a percent) stays a rule.
 */
function compact(value) {
  if (!isRule(value)) return typeof value === "boolean" ? value : false;
  const r = normalizeRule(value);
  if (r.staff.length || r.platforms.length) return r;
  if (r.mode === "off" && r.percent > 0 && r.percent < 100) return r;
  const simple = simpleValue(r);
  return simple === null ? r : simple;
}

function platformOk(rule, platform) {
  if (!rule.platforms.length || !platform) return true;
  return rule.platforms.includes(String(platform).toLowerCase());
}

/**
 * Is the flag on for this user on this platform?
 * @param {boolean|object} value  stored flag
 * @param {{ flagKey: string, userId?: string|null, platform?: string|null, staff?: boolean }} ctx
 *   `staff` = already known to be in the list (the client gets only this bit, never the ids).
 */
function evaluate(value, ctx = {}) {
  if (typeof value === "boolean") return value;
  if (!isRule(value)) return false;
  const rule = normalizeRule(value);
  const uid = ctx.userId ? String(ctx.userId).toLowerCase() : null;
  const isStaff = ctx.staff === true || Boolean(uid && rule.staff.includes(uid));
  if (rule.mode === "off") return false;
  if (isStaff) return true;
  if (rule.mode === "staff") return false;
  if (!platformOk(rule, ctx.platform)) return false;
  if (rule.mode === "all") return true;
  const b = bucketOf(ctx.flagKey || "", uid);
  return b != null && b < rule.percent;
}

/** What a client may see of a rule: no staff ids, only whether this user is one. */
function publicRule(value, ctx = {}) {
  if (!isRule(value)) return null;
  const rule = normalizeRule(value);
  const uid = ctx.userId ? String(ctx.userId).toLowerCase() : null;
  return { mode: rule.mode, percent: rule.percent, platforms: rule.platforms.slice(), staff: Boolean(uid && rule.staff.includes(uid)) };
}

/** Share of all users a rule reaches on its platforms (0-100), for "Yaklaşık 1.940 / 7.760". */
function reachPercent(value) {
  if (typeof value === "boolean") return value ? 100 : 0;
  const r = normalizeRule(value);
  if (r.mode === "all") return 100;
  if (r.mode === "rollout") return r.percent;
  return 0;
}

module.exports = {
  MODES,
  PLATFORMS,
  STAFF_MAX,
  fnv1a,
  bucketOf,
  isRule,
  normalizeRule,
  toRule,
  simpleValue,
  compact,
  evaluate,
  publicRule,
  reachPercent,
};
