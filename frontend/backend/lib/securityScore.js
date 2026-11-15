"use strict";

/**
 * Güvenlik puanı (Güvenlik Merkezi, Draft A): 12 checks over the live settings, the
 * admins' 2FA and what is actually running. Each check has a weight; the score is the
 * share of passed weight (0..100). A failed check with a `fix` is a recommendation the
 * page can apply in one step (a settings patch); `remind` sends the 2FA reminder;
 * the human check has no fix here (it needs a captcha provider), so it only explains.
 * Pure: the route gathers the inputs.
 */

const RECOMMENDED = Object.freeze({
  maxLoginAttempts: 5,
  maxMessagesPerMinute: 60,
  dmRateLimitMs: 200,
  dmMinAccountAgeHours: 24,
  disposableEmailBlock: true,
});

const CHECKS = Object.freeze([
  // Weights add up to 100, so a check's weight is exactly the points it is worth.
  { id: "humanCheck", weight: 8 },
  { id: "admin2fa", weight: 14 },
  { id: "totpEnforced", weight: 8 },
  { id: "dmMinAge", weight: 4 },
  { id: "loginLimit", weight: 10 },
  { id: "disposableEmail", weight: 6 },
  { id: "messageRate", weight: 8 },
  { id: "dmRate", weight: 4 },
  { id: "accessBans", weight: 10 },
  { id: "eventLog", weight: 10 },
  { id: "auditLog", weight: 10 },
  { id: "noOpenLock", weight: 8 },
]);
const TOTAL = CHECKS.reduce((n, c) => n + c.weight, 0);

function points(weight) {
  return Math.round((weight / TOTAL) * 100);
}

/**
 * @param {object} p
 * @param {object} p.config        securityView(config)
 * @param {{ twoFactor: boolean, username: string }[]} p.admins
 * @param {{ humanCheck?: boolean, totpEnforced?: boolean, accessBans?: boolean, eventLog?: boolean, auditLog?: boolean }} p.env
 */
function computeScore({ config = {}, admins = [], env = {} } = {}) {
  const c = config;
  const without2fa = admins.filter((a) => !a.twoFactor);
  const openLocks = Object.entries(c.locks || {}).filter(([, l]) => l && !l.until).map(([m]) => m);
  const login = Number(c.maxLoginAttempts) || 5;
  const msg = Number(c.maxMessagesPerMinute) || 0;
  const dmRate = Number(c.dmRateLimitMs) || 0;
  const age = Number(c.dmMinAccountAgeHours) || 0;

  const results = {
    humanCheck: { ok: Boolean(env.humanCheck), action: env.humanCheck ? null : "explain" },
    admin2fa: { ok: admins.length > 0 && without2fa.length === 0, action: without2fa.length ? "remind" : null, vars: { total: admins.length, missing: without2fa.length }, people: without2fa.map((a) => a.username).slice(0, 12) },
    totpEnforced: { ok: env.totpEnforced !== false, action: env.totpEnforced === false ? "explain" : null },
    dmMinAge: { ok: age >= 1, vars: { hours: age }, fix: age >= 1 ? null : { dmMinAccountAgeHours: RECOMMENDED.dmMinAccountAgeHours } },
    loginLimit: { ok: login <= 10, vars: { n: login }, fix: login <= 10 ? null : { maxLoginAttempts: RECOMMENDED.maxLoginAttempts } },
    disposableEmail: { ok: c.disposableEmailBlock === true, fix: c.disposableEmailBlock === true ? null : { disposableEmailBlock: true } },
    messageRate: { ok: msg >= 1 && msg <= 120, vars: { n: msg }, fix: msg >= 1 && msg <= 120 ? null : { maxMessagesPerMinute: RECOMMENDED.maxMessagesPerMinute } },
    dmRate: { ok: dmRate >= 100, vars: { ms: dmRate }, fix: dmRate >= 100 ? null : { dmRateLimitMs: RECOMMENDED.dmRateLimitMs } },
    accessBans: { ok: env.accessBans !== false, action: env.accessBans === false ? "explain" : null },
    eventLog: { ok: env.eventLog !== false, action: env.eventLog === false ? "explain" : null },
    auditLog: { ok: env.auditLog !== false, action: env.auditLog === false ? "explain" : null },
    noOpenLock: { ok: openLocks.length === 0, vars: { modes: openLocks }, action: openLocks.length ? "locks" : null },
  };

  let passed = 0;
  let fixable = 0;
  const checks = CHECKS.map(({ id, weight }) => {
    const r = results[id];
    if (r.ok) passed += weight;
    else if (r.fix) fixable += weight;
    return {
      id,
      weight,
      points: points(weight),
      ok: Boolean(r.ok),
      vars: r.vars || {},
      fix: r.ok ? null : r.fix || null,
      action: r.ok ? null : r.fix ? "apply" : r.action || "explain",
      people: r.people || undefined,
    };
  });
  // Failed first, then passed, each group in the fixed check order (Draft A list).
  const order = (x) => (x.ok ? 1 : 0);
  checks.sort((a, b) => order(a) - order(b));
  const score = Math.round((passed / TOTAL) * 100);
  const recommendations = checks.filter((x) => !x.ok && x.fix).length;
  const potential = Math.round(((passed + fixable) / TOTAL) * 100);
  return {
    score,
    passedCount: checks.filter((x) => x.ok).length,
    total: checks.length,
    recommendations,
    potential,
    grade: gradeOf(score),
    checks,
    weights: CHECKS.map(({ id, weight }) => ({ id, weight, points: points(weight) })),
  };
}

function gradeOf(score) {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 50) return "fair";
  return "poor";
}

/** All fixes of the failed checks in one patch ("3 öneriyi uygula"). */
function allFixes(result) {
  const patch = {};
  for (const c of result?.checks || []) if (!c.ok && c.fix) Object.assign(patch, c.fix);
  return patch;
}

module.exports = { CHECKS, TOTAL, RECOMMENDED, computeScore, gradeOf, allFixes, points };
