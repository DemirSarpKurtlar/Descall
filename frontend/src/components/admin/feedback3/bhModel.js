/*
 * Bug Avcısı, admin feedback workspace: pure helpers (bhModel.selftest.mjs). The server is the
 * source of truth (GET /api/admin/feedback/bug-hunter); these only shape what the panel draws:
 * the confirm panel's "what happens" outcome, the duplicate picker, the live preview entry the
 * sender will see, and the filter.
 */

export const SEVERITIES = ["low", "medium", "high", "critical"];
export const SEV_KEY = { low: "bhunt.sevLow", medium: "bhunt.sevMedium", high: "bhunt.sevHigh", critical: "bhunt.sevCritical" };
export const SEV_COLOR = { low: "#8ea0b8", medium: "#5b8cff", high: "#f5a524", critical: "#ff5a4c" };
export const DEFAULT_RULES = {
  tiers: [{ level: 1, min: 1 }, { level: 2, min: 5 }, { level: 3, min: 15 }],
  rewards: { first: { low: 25, medium: 50, high: 100, critical: 250 }, also: { low: 10, medium: 20, high: 40, critical: 100 } },
  alsoLevels: false,
};
export const ROMAN = { 1: "I", 2: "II", 3: "III" };

export function levelFor(count, rules = DEFAULT_RULES) {
  let level = 0;
  for (const t of rules.tiers) if (count >= t.min) level = t.level;
  return level;
}

export function nextTier(count, rules = DEFAULT_RULES) {
  const t = rules.tiers.find((x) => x.min > count);
  return t ? { level: t.level, min: t.min, left: t.min - count } : null;
}

/** Map feedbackId -> confirmation (the newest round). */
export function byFeedback(confirmations) {
  const out = new Map();
  for (const c of confirmations || []) if (c && c.feedbackId && !out.has(c.feedbackId)) out.set(c.feedbackId, c);
  return out;
}

/** Live first credits the confirm panel can link a duplicate to, with the feedback title. */
export function rootOptions(confirmations, items, { exclude = null, q = "", titleOf = (f) => f?.subject || "" } = {}) {
  const byId = new Map((items || []).map((f) => [f.id, f]));
  const needle = String(q || "").trim().toLocaleLowerCase();
  return (confirmations || [])
    .filter((c) => c.live && c.credit === "first" && c.feedbackId !== exclude)
    .map((c) => {
      const f = byId.get(c.feedbackId) || null;
      return { ...c, title: f ? titleOf(f) : c.feedbackId, username: f?.user?.username || null, createdAt: f?.created_at || null };
    })
    .filter((o) => !needle || [o.title, o.username, o.feedbackId].some((v) => String(v || "").toLocaleLowerCase().includes(needle)))
    .sort((a, b) => String(b.confirmedAt || "").localeCompare(String(a.confirmedAt || "")));
}

/** The picked root was reported after this item: this sender may be the first reporter. */
export function reportedEarlier(feedback, root) {
  const a = Date.parse(feedback?.created_at || "");
  const b = Date.parse(root?.createdAt || "");
  return Number.isFinite(a) && Number.isFinite(b) && a < b;
}

/**
 * What a confirm will do, before it is sent:
 * { credit, severity, reward, carried, badge: "new"|"up"|"more"|"none", from, to, count, next, glitch }
 * `person` is the reporter's stats (workspace.people[userId]); `previous` an undone round of
 * this item (a kept bonus is carried, not paid again); `holds` whether they hold #11 now.
 */
export function outcome({ severity, duplicateOf = null, roots = [], visual = false, person = null, holds = false, previous = null, rules = DEFAULT_RULES }) {
  const root = duplicateOf ? roots.find((r) => r.feedbackId === duplicateOf) || null : null;
  const credit = duplicateOf ? "also" : "first";
  const sev = severity || root?.severity || "medium";
  const carried = Boolean(previous && previous.rewardState === "kept" && previous.reward > 0);
  const reward = carried ? 0 : rules.rewards[credit][sev] || 0;
  const before = Math.max(0, Number(person?.bugs) || 0);
  const counts = credit === "first" || rules.alsoLevels;
  const count = counts ? before + 1 : before;
  const from = levelFor(before, rules);
  const to = levelFor(count, rules);
  let badge = "none";
  if (counts && to >= 1) badge = !holds ? "new" : to > from && from >= 1 ? "up" : "more";
  return { credit, severity: sev, reward, carried, badge, from, to, count, next: nextTier(count, rules), glitch: credit === "first" && visual };
}

/**
 * The thread line the sender will get, built like the server's threadEntry (bot.bughunt.* refs),
 * for the live preview (BugHuntCard renders it in the viewer's language).
 */
export function previewEntry(o, { fixedNow = false } = {}) {
  const ref = (key, vars) => (vars ? { key, vars } : { key });
  const e = {
    id: "preview",
    type: "bughunt",
    event: o.credit === "also" ? "also" : "confirmed",
    severity: o.severity,
    level: o.to,
    badge: o.badge,
    count: o.count,
    reward: o.reward,
    badgeId: o.badge === "none" ? null : "bughunter",
    text: "",
    i18n: {},
  };
  e.i18n.text = ref(o.credit === "also" ? "bot.bughunt.also" : fixedNow ? "bot.bughunt.confirmedFixed" : "bot.bughunt.confirmed");
  const line = { new: "bot.bughunt.badgeNew", up: "bot.bughunt.badgeUp", more: "bot.bughunt.badgeMore" }[o.badge];
  if (line) { e.badgeLine = " "; e.i18n.badgeLine = ref(line, { level: ROMAN[o.to] || "I", count: o.count }); }
  if (o.glitch) { e.glitchLine = " "; e.i18n.glitchLine = ref("bot.bughunt.badgeGlitch"); }
  if (o.reward > 0) { e.rewardLine = " "; e.i18n.rewardLine = ref("bot.bughunt.reward", { amount: o.reward }); }
  return e;
}

/** Feedback filtered to live confirmations (the "Doğrulanmış buglar" chip). */
export function onlyConfirmed(list, map) {
  return (list || []).filter((f) => map.get(f.id)?.live);
}

/** Severity mix bar segments for a leaderboard row: [[severity, share 0..1], ...]. */
export function mixSegments(bySeverity) {
  const total = SEVERITIES.reduce((n, s) => n + (Number(bySeverity?.[s]) || 0), 0);
  if (!total) return [];
  return [...SEVERITIES].reverse().filter((s) => Number(bySeverity?.[s]) > 0).map((s) => [s, Number(bySeverity[s]) / total]);
}

/** Error code -> catalog key. */
export function errorKey(code) {
  const known = ["SELF_CONFIRM", "SAME_REPORTER", "ROOT_NOT_CONFIRMED", "HAS_DUPLICATES", "REASON_REQUIRED", "ALREADY_UNDONE", "NOT_INSTALLED"];
  return known.includes(code) ? `bhunt.err${code}` : "bhunt.errGeneric";
}
