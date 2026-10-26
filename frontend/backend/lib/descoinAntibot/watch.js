"use strict";

/**
 * Watch list rules for the "Şüpheli Davranışlar" admin tab (decisions
 * 25 Oct 2026). Pure helpers + the rule evaluation the risk job runs.
 *
 * Rule kinds:
 *   risk_above   score crosses `threshold` (from below)
 *   held_above   DesCoin that would be withheld in 7 days crosses `threshold`
 *                (Faz 0: a shadow number; nothing is withheld)
 *   new_link     the account gets linked to an account it was not linked to
 *   cluster_join an account joins the account's link cluster (via a linked account)
 *   new_signal   a risk reason appears that was not there before
 *
 * Each rule fires once per event: `fired_key` remembers the event that fired
 * last, so the same crossing / link / signal never alerts twice.
 * Alerts carry usernames only inside the admin panel; email / push carry counts.
 */

const KINDS = ["risk_above", "held_above", "new_link", "cluster_join", "new_signal"];
const NEEDS_THRESHOLD = new Set(["risk_above", "held_above"]);
const MAX_RULES = 6;

function normalizeRules(input) {
  if (!Array.isArray(input)) return { error: "`rules` must be a list." };
  if (input.length > MAX_RULES) return { error: `At most ${MAX_RULES} rules.` };
  const out = [];
  const seen = new Set();
  for (const r of input) {
    const kind = String(r?.kind || "");
    if (!KINDS.includes(kind)) return { error: "Unknown rule kind." };
    let threshold = null;
    if (NEEDS_THRESHOLD.has(kind)) {
      const n = Number(r?.threshold);
      const max = kind === "risk_above" ? 100 : 10_000_000;
      if (!Number.isInteger(n) || n < 1 || n > max) return { error: "Invalid threshold." };
      threshold = n;
    }
    const key = `${kind}:${threshold ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind, threshold });
  }
  return { rules: out };
}

/** First 4 + last 4 characters of a keyed hash (admins only); never the full value. */
function maskHash(hash) {
  const h = String(hash || "");
  if (h.length < 12) return null;
  return `${h.slice(0, 4)}·····${h.slice(-4)}`;
}

/** Connected components over account links. Returns arrays of user ids (size >= 2). */
function clustersOf(links) {
  const parent = new Map();
  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x);
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r);
    let c = x;
    while (parent.get(c) !== r) {
      const n = parent.get(c);
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  for (const l of links || []) {
    if (!l?.a || !l?.b || l.a === l.b) continue;
    const ra = find(l.a);
    const rb = find(l.b);
    if (ra !== rb) parent.set(ra, rb);
  }
  const groups = new Map();
  for (const x of parent.keys()) {
    const r = find(x);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(x);
  }
  return [...groups.values()].filter((g) => g.length >= 2).map((g) => g.sort());
}

function severityFor(kind, value) {
  if (kind === "new_link" || kind === "cluster_join") return "hi";
  if (kind === "risk_above") return value >= 70 ? "hi" : value >= 40 ? "mid" : "lo";
  if (kind === "held_above") return "mid";
  return "lo";
}

/**
 * Decide which rules fire. Pure.
 * @param {Array<{id,user_id,kind,threshold,fired_key}>} rules
 * @param {Map<string, {score, prevScore, held, prevHeld, linked:string[], prevLinked:string[],
 *          cluster:string[], prevCluster:string[], reasons:string[], prevReasons:string[]}>} facts
 * @returns {Array<{rule, kind, severity, body, firedKey}>}
 */
function evaluateRules(rules, facts) {
  const fires = [];
  for (const rule of rules || []) {
    const f = facts.get(rule.user_id);
    if (!f) continue;
    let body = null;
    let firedKey = null;
    if (rule.kind === "risk_above") {
      const t = rule.threshold;
      if (f.score >= t && (f.prevScore == null || f.prevScore < t)) {
        firedKey = `risk:${t}:${f.score}`;
        body = { score: f.score, threshold: t };
      }
    } else if (rule.kind === "held_above") {
      const t = rule.threshold;
      if (f.held >= t && (f.prevHeld == null || f.prevHeld < t)) {
        firedKey = `held:${t}`;
        body = { held: f.held, threshold: t };
      }
    } else if (rule.kind === "new_link") {
      const prev = new Set(f.prevLinked || []);
      const added = (f.linked || []).filter((x) => !prev.has(x));
      if (added.length) {
        firedKey = `link:${added.slice().sort().join(",")}`.slice(0, 200);
        body = { added: added.slice(0, 5) };
      }
    } else if (rule.kind === "cluster_join") {
      const prev = new Set([...(f.prevCluster || []), ...(f.prevLinked || [])]);
      const direct = new Set(f.linked || []);
      const joined = (f.cluster || []).filter((x) => x !== rule.user_id && !prev.has(x) && !direct.has(x));
      if (joined.length) {
        firedKey = `cluster:${joined.slice().sort().join(",")}`.slice(0, 200);
        body = { joined: joined.slice(0, 5) };
      }
    } else if (rule.kind === "new_signal") {
      if (f.prevReasons) {
        const prev = new Set(f.prevReasons);
        const added = (f.reasons || []).filter((r) => !prev.has(r));
        if (added.length) {
          firedKey = `sig:${added.slice().sort().join(",")}`;
          body = { added, score: f.score };
        }
      }
    }
    if (!body || firedKey === rule.fired_key) continue;
    fires.push({ rule, kind: rule.kind, severity: severityFor(rule.kind, f.score), body, firedKey });
  }
  return fires;
}

module.exports = { KINDS, MAX_RULES, normalizeRules, maskHash, clustersOf, evaluateRules, severityFor };
