/**
 * Pure helpers for the admin "Şüpheli Davranışlar" tab (decisions 25 Oct 2026).
 * Score = sum of signal weights capped at 100; earning ×0.5 at 40+, ×0 at 70+,
 * ×1 for trusted accounts. Colours: red 70+, orange 40–69, blue 0–39.
 */

export const SIGNAL_ORDER = [
  "linked_account",
  "automation_client",
  "timing_regular",
  "referral_insular",
  "headless",
  "rate_extreme",
  "new_unverified",
  "missing_client_signals",
];

export const DEFAULT_WEIGHTS = {
  linked_account: 35,
  automation_client: 30,
  timing_regular: 25,
  referral_insular: 20,
  headless: 15,
  rate_extreme: 15,
  new_unverified: 10,
  missing_client_signals: 5,
};

export const RULE_KINDS = ["risk_above", "held_above", "new_link", "cluster_join", "new_signal"];
export const RULE_NEEDS_THRESHOLD = new Set(["risk_above", "held_above"]);
export const LINK_KINDS = ["same_device", "same_subnet", "referral_pair", "signup_close", "insular_pair"];
export const BLOCK_REASONS = ["similar", "no_reply", "too_short", "one_partner_limit", "self_dm", "same_turn"];

export function tone(score) {
  const s = Number(score) || 0;
  if (s >= 70) return "hi";
  if (s >= 40) return "mid";
  return "lo";
}

export function multiplierFor(score, trusted) {
  if (trusted) return 1;
  const s = Number(score) || 0;
  if (s >= 70) return 0;
  if (s >= 40) return 0.5;
  return 1;
}

export function statusFor(score, trusted) {
  if (trusted) return "trusted";
  const m = multiplierFor(score, false);
  if (m === 0) return "stopped";
  if (m === 0.5) return "half";
  return "normal";
}

export function signalTone(weight) {
  const w = Number(weight) || 0;
  if (w >= 30) return "hi";
  if (w >= 15) return "mid";
  return "lo";
}

/** Strongest first; unknown reasons last. */
export function sortReasons(reasons, weights = DEFAULT_WEIGHTS) {
  return [...new Set((Array.isArray(reasons) ? reasons : []).filter((r) => typeof r === "string"))].sort(
    (a, b) => (weights[b] || 0) - (weights[a] || 0)
  );
}

export function rawScore(reasons, weights = DEFAULT_WEIGHTS) {
  return sortReasons(reasons, weights).reduce((n, r) => n + (weights[r] || 0), 0);
}

const NF = new Intl.NumberFormat("tr-TR");
export function fmtNumber(n) {
  return NF.format(Math.round(Number(n) || 0));
}

/** Never show more than first 4 + last 4 characters of a hash. */
export function maskHash(h) {
  const s = String(h || "");
  if (!s) return "";
  if (s.includes("·")) return s;
  if (s.length <= 8) return "····";
  return `${s.slice(0, 4)}·····${s.slice(-4)}`;
}

/** Faz strip from /status flags. */
export function phasesFrom(flags = {}) {
  const f = flags || {};
  return [
    { id: 0, key: "monitor", on: Boolean(f.monitor) },
    { id: 1, key: "rules", on: Boolean(f.rates || f.messageRules || f.referralPending) },
    { id: 2, key: "media", on: Boolean(f.mediaRules) },
    { id: 3, key: "withhold", on: Boolean(f.withhold) },
  ];
}

const TR_MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Istanbul (UTC+3, no DST) date parts. */
function trtParts(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms + 3 * 3600_000);
  return { day: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear(), h: d.getUTCHours(), m: d.getUTCMinutes() };
}

export function shortDate(iso, locale = "tr") {
  const p = trtParts(iso);
  if (!p) return "";
  const mon = (locale === "en" ? EN_MONTHS : TR_MONTHS)[p.month];
  return locale === "en" ? `${mon} ${p.day}` : `${p.day} ${mon}`;
}

export function shortDateTime(iso, locale = "tr") {
  const p = trtParts(iso);
  if (!p) return "";
  const hm = `${String(p.h).padStart(2, "0")}:${String(p.m).padStart(2, "0")}`;
  return `${shortDate(iso, locale)} ${hm}`;
}

/** Account age: "6 gün", "3 ay", "1 yıl". Returns { n, unit } for i18n. */
export function accountAge(createdAt, now = Date.now()) {
  const ms = Date.parse(createdAt);
  if (!Number.isFinite(ms)) return null;
  const days = Math.max(0, Math.floor((now - ms) / 86_400_000));
  if (days < 1) return { n: 0, unit: "today" };
  if (days < 60) return { n: days, unit: "day" };
  if (days < 365) return { n: Math.floor(days / 30), unit: "month" };
  return { n: Math.floor(days / 365), unit: "year" };
}

/** Day label "19" from "2026-10-19". */
export function dayOfMonth(dayKey) {
  const m = /^\d{4}-\d{2}-(\d{2})$/.exec(String(dayKey || ""));
  return m ? String(Number(m[1])) : "";
}

/** Max for the 7-day bar chart: rounded up to a friendly step, includes the average line. */
export function chartMax(days, avg = 0) {
  const top = Math.max(Number(avg) || 0, ...(days || []).map((d) => Number(d.amount) || 0), 1);
  const step = top > 500 ? 250 : top > 100 ? 50 : 10;
  return Math.ceil((top * 1.1) / step) * step;
}

/**
 * Lay out the linked-accounts graph: the account in the middle, direct links
 * on a circle around it. Deterministic (sorted by id) so it does not jump.
 */
export function layoutGraph(graph, centerId, { w = 312, h = 172 } = {}) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const cx = w / 2;
  const cy = h / 2;
  const others = nodes.filter((n) => n.id !== centerId).slice(0, 10);
  const placed = new Map();
  const center = nodes.find((n) => n.id === centerId);
  if (center) placed.set(center.id, { ...center, x: cx, y: cy, main: true });
  const rx = Math.min(w / 2 - 40, 120);
  const ry = Math.min(h / 2 - 30, 60);
  others.forEach((n, i) => {
    const a = Math.PI + (i / Math.max(others.length, 1)) * Math.PI * 2 - (others.length === 1 ? Math.PI : 0);
    placed.set(n.id, { ...n, x: Math.round(cx + rx * Math.cos(a)), y: Math.round(cy + ry * Math.sin(a)) });
  });
  const seen = new Set();
  const lines = [];
  for (const e of edges) {
    const A = placed.get(e.a);
    const B = placed.get(e.b);
    if (!A || !B) continue;
    const key = [e.a, e.b].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push({ a: A, b: B, kind: (e.kinds || [])[0] || null });
  }
  return { nodes: [...placed.values()], lines };
}

/** Client-side guard: the server enforces the same (403). */
export function canWrite(role) {
  return role === "admin";
}

/** Graph node badge: the trailing number of a farm-style username ("kral_farm34" → "34"), else two letters. */
export function nodeBadge(username) {
  const u = String(username || "?");
  const m = u.match(/(\d{1,3})$/);
  return m ? m[1] : u.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "?";
}

/** Graph node labels: drop a shared "kral_"-style prefix so names fit under the nodes. */
export function nodeLabels(usernames) {
  const names = usernames.map((u) => String(u || "?"));
  if (names.length < 2) return names;
  const cut = names[0].search(/[_.]/);
  const pre = cut > 1 ? names[0].slice(0, cut + 1) : "";
  const strip = pre && names.every((n) => n.startsWith(pre) && n.length > pre.length);
  return names.map((n) => {
    const s = strip ? n.slice(pre.length) : n;
    return s.length > 11 ? `${s.slice(0, 10)}…` : s;
  });
}
