/**
 * Client-side feature flag check (Sistem page rollout, Nov 2026). Same algorithm as
 * backend/lib/featureRollout.js (backend/test/featureRollout.test.cjs keeps them equal).
 *
 * /api/features and the `features:updated` socket event carry
 *   - the resolved booleans old clients read (iosGlass, desktopGlass), and
 *   - `flagRules: { <key>: { mode, percent, platforms, staff } }` when a flag is a rule.
 * `staff` is already resolved for this account (the ids never leave the server).
 */

export const MODES = Object.freeze(["off", "staff", "rollout", "all"]);
export const PLATFORMS = Object.freeze(["web", "electron", "ios", "android"]);

export function fnv1a(text) {
  let h = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Stable 0-99 bucket for this user and flag. */
export function bucketOf(flagKey, userId) {
  if (!userId) return null;
  return fnv1a(`${flagKey}:${String(userId).toLowerCase()}`) % 100;
}

function isRule(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Is the flag on here? `rule` is a boolean or a public rule; `ctx` = { flagKey, userId, platform }.
 */
export function evaluateRule(rule, ctx = {}) {
  if (typeof rule === "boolean") return rule;
  if (!isRule(rule)) return false;
  const mode = MODES.includes(rule.mode) ? rule.mode : "off";
  if (mode === "off") return false;
  if (rule.staff === true) return true;
  if (Array.isArray(rule.staff) && ctx.userId && rule.staff.map((x) => String(x).toLowerCase()).includes(String(ctx.userId).toLowerCase())) return true;
  if (mode === "staff") return false;
  const platforms = Array.isArray(rule.platforms) ? rule.platforms : [];
  // An unknown platform is not excluded (same as the server); a known one must be listed.
  if (platforms.length && ctx.platform && !platforms.includes(String(ctx.platform).toLowerCase())) return false;
  if (mode === "all") return true;
  const pct = Math.min(100, Math.max(0, Math.round(Number(rule.percent) || 0)));
  const b = bucketOf(ctx.flagKey || "", ctx.userId);
  return b != null && b < pct;
}

/**
 * The value to use for `key` from a features payload: the local rule check when the
 * payload carries a rule, otherwise the server's boolean (undefined when missing, so
 * callers that keep a cached value can tell "not sent" from "off").
 */
export function resolveFlag(payload, key, ctx = {}) {
  const src = payload && typeof payload === "object" ? payload : {};
  const rule = src.flagRules && typeof src.flagRules === "object" ? src.flagRules[key] : undefined;
  if (isRule(rule)) return evaluateRule(rule, { ...ctx, flagKey: key });
  return typeof src[key] === "boolean" ? src[key] : undefined;
}
