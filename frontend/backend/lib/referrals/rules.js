"use strict";

/**
 * Davet ödülleri: versioned rules (referral_rules, one row per version, the newest wins).
 * Pure helpers: defaults, validation, diff for the audit line ("aylık sınır 25 -> 20").
 *
 * The reward unlocks only when the invited friend is really active: a first message, then
 * a return visit at least `returnAfterHours` after sign-up. A row that is not complete
 * `returnWindowHours` after sign-up expires (no reward). Signals decide what happens to a
 * suspicious sign-up: hold (admin reviews), warn (shown, still pays), deny (no reward).
 */

// Exclusive invite cosmetics (catalog/referral/cosmetics.js): never on sale, granted only here.
const COSMETICS = require("../../catalog/referral/cosmetics");

const SIGNAL_CODES = Object.freeze([
  "same_device",
  "inviter_device",
  "same_subnet",
  "disposable_email",
  "fast_first_message",
  "inviter_only",
]);
const SIGNAL_ACTIONS = Object.freeze(["none", "warn", "hold", "deny"]);
const MILESTONE_KINDS = Object.freeze(["badge", "frame", "banner"]);

const DEFAULT_RULES = Object.freeze({
  inviterReward: 100,
  inviteeReward: 50,
  requireFirstMessage: true,
  returnAfterHours: 24,
  returnWindowHours: 72,
  monthlyCap: 20,
  minInviterAgeDays: 7,
  fastMessageSeconds: 10,
  highRiskHold: 70,
  milestones: Object.freeze([
    Object.freeze({ at: 3, amount: 250, kind: "badge", itemIds: Object.freeze([...COSMETICS.MILESTONE_ITEMS[3]]) }),
    Object.freeze({ at: 10, amount: 750, kind: "frame", itemIds: Object.freeze([...COSMETICS.MILESTONE_ITEMS[10]]) }),
    Object.freeze({ at: 25, amount: 2000, kind: "banner", itemIds: Object.freeze([...COSMETICS.MILESTONE_ITEMS[25]]) }),
  ]),
  inviteeItemIds: Object.freeze([...COSMETICS.INVITEE_ITEMS]),
  signals: Object.freeze({
    same_device: "hold",
    inviter_device: "hold",
    same_subnet: "warn",
    disposable_email: "deny",
    fast_first_message: "hold",
    inviter_only: "warn",
  }),
  anomaly: Object.freeze({ windowMinutes: 60, minSignups: 5, multiplier: 6 }),
});

const LIMITS = {
  inviterReward: [0, 5000],
  inviteeReward: [0, 5000],
  returnAfterHours: [0, 168],
  returnWindowHours: [24, 24 * 30],
  monthlyCap: [0, 500],
  minInviterAgeDays: [0, 365],
  fastMessageSeconds: [0, 600],
  highRiskHold: [1, 101],
};

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

function intIn(value, [min, max], field) {
  const n = Number(value);
  if (!Number.isFinite(n) || Math.floor(n) !== n || n < min || n > max) {
    const err = new Error(`${field} must be a whole number between ${min} and ${max}.`);
    err.code = "RULES_INVALID";
    err.field = field;
    throw err;
  }
  return n;
}

function bad(field, message) {
  const err = new Error(message);
  err.code = "RULES_INVALID";
  err.field = field;
  return err;
}

const ITEM_ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;

function cleanItemId(v, field) {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (!ITEM_ID_RE.test(s)) throw bad(field, `${field} is not a valid item id.`);
  return s;
}

/** A list of item ids (an older single `itemId` value is read as a one-item list). */
function cleanItemIds(list, single, field) {
  const raw = Array.isArray(list) ? list : single != null && single !== "" ? [single] : [];
  if (raw.length > 4) throw bad(field, `${field} lists at most 4 items.`);
  return [...new Set(raw.map((v, i) => cleanItemId(v, `${field}.${i}`)).filter(Boolean))];
}

/**
 * Merge an admin edit onto the current rules and validate the result. Unknown keys are
 * dropped. Throws { code: "RULES_INVALID", field } on a bad value.
 */
function validateRules(input, base = DEFAULT_RULES) {
  const src = input && typeof input === "object" ? input : {};
  const out = clone(base);
  for (const key of Object.keys(LIMITS)) {
    if (src[key] !== undefined) out[key] = intIn(src[key], LIMITS[key], key);
  }
  if (src.requireFirstMessage !== undefined) out.requireFirstMessage = src.requireFirstMessage !== false;
  if (out.returnWindowHours <= out.returnAfterHours) {
    throw bad("returnWindowHours", "returnWindowHours must be longer than returnAfterHours.");
  }
  if (src.inviteeItemIds !== undefined || src.inviteeItemId !== undefined) {
    out.inviteeItemIds = cleanItemIds(src.inviteeItemIds, src.inviteeItemId, "inviteeItemIds");
  }
  if (src.milestones !== undefined) {
    if (!Array.isArray(src.milestones) || src.milestones.length < 1 || src.milestones.length > 5) {
      throw bad("milestones", "milestones must list 1 to 5 steps.");
    }
    let prev = 0;
    out.milestones = src.milestones.map((m, i) => {
      const at = intIn(m?.at, [1, 1000], `milestones.${i}.at`);
      if (at <= prev) throw bad(`milestones.${i}.at`, "milestones must grow.");
      prev = at;
      const kind = MILESTONE_KINDS.includes(m?.kind) ? m.kind : MILESTONE_KINDS[Math.min(i, MILESTONE_KINDS.length - 1)];
      const prevItems = (base.milestones || []).find((x) => x.at === at)?.itemIds || [];
      return {
        at,
        amount: intIn(m?.amount ?? 0, [0, 20000], `milestones.${i}.amount`),
        kind,
        itemIds: m?.itemIds !== undefined || m?.itemId !== undefined ? cleanItemIds(m?.itemIds, m?.itemId, `milestones.${i}.itemIds`) : [...prevItems],
      };
    });
  }
  if (src.signals !== undefined) {
    if (!src.signals || typeof src.signals !== "object") throw bad("signals", "signals must be an object.");
    for (const code of SIGNAL_CODES) {
      if (src.signals[code] === undefined) continue;
      if (!SIGNAL_ACTIONS.includes(src.signals[code])) throw bad(`signals.${code}`, `signals.${code} is not a known action.`);
      out.signals[code] = src.signals[code];
    }
  }
  if (src.anomaly !== undefined) {
    const a = src.anomaly || {};
    out.anomaly = {
      windowMinutes: intIn(a.windowMinutes ?? out.anomaly.windowMinutes, [10, 24 * 60], "anomaly.windowMinutes"),
      minSignups: intIn(a.minSignups ?? out.anomaly.minSignups, [2, 500], "anomaly.minSignups"),
      multiplier: intIn(a.multiplier ?? out.anomaly.multiplier, [2, 100], "anomaly.multiplier"),
    };
  }
  return out;
}

/** A stored rules object (any older shape) completed with today's defaults. */
function normalizeStored(rules) {
  try {
    return validateRules(rules || {}, DEFAULT_RULES);
  } catch {
    return clone(DEFAULT_RULES);
  }
}

/** Flat list of changed values: [{ key: "monthlyCap", from: 25, to: 20 }]. */
function diffRules(a, b) {
  const out = [];
  const walk = (x, y, prefix) => {
    const keys = new Set([...Object.keys(x || {}), ...Object.keys(y || {})]);
    for (const k of keys) {
      const path = prefix ? `${prefix}.${k}` : k;
      const xv = x ? x[k] : undefined;
      const yv = y ? y[k] : undefined;
      if (xv && yv && typeof xv === "object" && typeof yv === "object") walk(xv, yv, path);
      else if (JSON.stringify(xv) !== JSON.stringify(yv)) out.push({ key: path, from: xv ?? null, to: yv ?? null });
    }
  };
  walk(a, b, "");
  return out;
}

module.exports = {
  DEFAULT_RULES,
  SIGNAL_CODES,
  SIGNAL_ACTIONS,
  MILESTONE_KINDS,
  validateRules,
  normalizeStored,
  diffRules,
};
