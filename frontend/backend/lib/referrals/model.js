"use strict";

/**
 * Davet ödülleri: pure model (no database, no clock unless passed). Tested by
 * model.selftest.cjs. Used by engine.js (decisions), routes/invites.js (the user's Davet
 * Merkezi) and routes/adminInvites.js (the control board).
 *
 * A referral row moves:  pending -> paid            (first message + return after 24 h)
 *                        pending -> held -> pending (a signal or an admin; release)
 *                        pending -> expired         (not active inside the window)
 *                        pending -> denied          (deny signal, paused link, self)
 *                        any     -> revoked         (admin, with reason; undo 10 min)
 * The four funnel steps the user sees: opened (anonymous), signed up, first message, active.
 */

const crypto = require("crypto");

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const CHANNELS = Object.freeze(["wa", "ig", "tt", "qr", "link", "other"]);
const STATUSES = Object.freeze(["pending", "held", "paid", "revoked", "expired", "denied"]);
const ACTION_RANK = { none: 0, warn: 1, hold: 2, deny: 3 };

function normalizeChannel(raw) {
  const k = String(raw || "").trim().toLowerCase();
  if (CHANNELS.includes(k)) return k;
  if (k === "whatsapp") return "wa";
  if (k === "instagram") return "ig";
  if (k === "tiktok") return "tt";
  if (k === "copy" || k === "cp") return "link";
  if (k === "share" || k === "mo" || k === "more") return "other";
  return null;
}

const ms = (iso) => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
};

/** Salted one-way hash for device ids, addresses and visitors (never stored raw). */
function hashOf(kind, value, salt = process.env.JWT_SECRET || "descall-referrals") {
  const v = String(value || "").trim();
  if (!v) return null;
  return crypto.createHash("sha256").update(`${salt}|${kind}|${v}`).digest("hex").slice(0, 32);
}

/** IPv4 /24 or IPv6 /48 prefix of an address ("" when unknown). */
function subnetOf(ip) {
  const s = String(ip || "").trim().replace(/^::ffff:/, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) return s.split(".").slice(0, 3).join(".");
  if (s.includes(":")) return s.split(":").slice(0, 3).join(":");
  return "";
}

/** Short label for a device cluster ("a3f9"), safe to show admins. */
function clusterLabel(deviceHash) {
  return deviceHash ? String(deviceHash).slice(0, 4) : null;
}

function emailDomain(email) {
  const s = String(email || "").trim().toLowerCase();
  const at = s.lastIndexOf("@");
  return at > 0 ? s.slice(at + 1).slice(0, 120) : null;
}

/** When the reward can unlock (sign-up + returnAfterHours) and when the row expires. */
function timeline(signupAt, rules) {
  const t = ms(signupAt);
  if (t == null) return { unlockAt: null, expiresAt: null };
  return {
    unlockAt: new Date(t + rules.returnAfterHours * HOUR).toISOString(),
    expiresAt: new Date(t + rules.returnWindowHours * HOUR).toISOString(),
  };
}

/**
 * What to do with a pending row now: "pay" | "expire" | "wait".
 * Paid when the first message happened (if the rules ask for it) and the invitee was seen
 * again at or after unlock time (a first message after unlock time counts as the return).
 */
function evaluateUnlock(row, rules, now = Date.now()) {
  if (!row || row.status !== "pending") return "wait";
  const signup = ms(row.signup_at || row.created_at);
  if (signup == null) return "wait";
  const unlock = signup + rules.returnAfterHours * HOUR;
  const expires = signup + rules.returnWindowHours * HOUR;
  const firstMsg = ms(row.first_message_at);
  const returned = ms(row.returned_at);
  const hasMessage = !rules.requireFirstMessage || firstMsg != null;
  const back = (returned != null && returned >= unlock && returned <= expires) || (firstMsg != null && firstMsg >= unlock && firstMsg <= expires);
  if (hasMessage && back && (firstMsg == null || firstMsg <= expires)) return "pay";
  if (now > expires) return "expire";
  return "wait";
}

/**
 * Funnel stage of one friend (1..4 of 4): 1 opened, 2 signed up, 3 first message, 4 active.
 * `waiting` marks the step that is in progress (the amber segment in the draft).
 */
function stageOf(row) {
  if (!row) return { stage: 1, of: 4, waiting: false };
  if (row.status === "paid") return { stage: 4, of: 4, waiting: false };
  if (row.first_message_at) return { stage: 3, of: 4, waiting: row.status === "pending" };
  return { stage: 2, of: 4, waiting: false };
}

/**
 * The row as the inviter and the invitee see it.
 * key: waiting_message | waiting_return | reviewing | paid | revoked | expired | denied
 */
function statusView(row, rules, now = Date.now()) {
  const { unlockAt, expiresAt } = timeline(row.signup_at || row.created_at, rules);
  const base = { unlockAt, expiresAt, countdownMs: null, why: null, holdReason: row.hold_reason || null };
  switch (row.status) {
    case "paid":
      return { ...base, key: "paid" };
    case "revoked":
      return { ...base, key: "revoked", why: row.revoke_reason || null };
    case "expired":
      return { ...base, key: "expired" };
    case "denied":
      return { ...base, key: "denied", why: row.hold_reason || row.inviter_skip || null };
    case "held":
      return { ...base, key: "reviewing", why: row.hold_reason || "review" };
    default: {
      if (rules.requireFirstMessage && !row.first_message_at) {
        return { ...base, key: "waiting_message", why: "first_message", countdownMs: Math.max(0, (ms(expiresAt) || now) - now) };
      }
      const left = Math.max(0, (ms(unlockAt) || now) - now);
      return { ...base, key: "waiting_return", why: left > 0 ? "next_day" : "come_back", countdownMs: left };
    }
  }
}

/**
 * Sign-up signals for one new invitee.
 * @param {object} c
 * @param {string|null} c.deviceHash   this sign-up's device
 * @param {string|null} c.subnetHash   this sign-up's /24
 * @param {boolean} c.disposable       throwaway email provider
 * @param {string[]} c.inviterDevices  the inviter's own recent devices
 * @param {string[]} c.inviterSubnets  the inviter's own recent networks
 * @param {object[]} c.siblings        the inviter's other invitees (30 days): { device_hash, subnet_hash }
 * @returns {{ code: string, detail?: object }[]}
 */
function signupSignals(c) {
  const out = [];
  const sibs = Array.isArray(c.siblings) ? c.siblings : [];
  if (c.deviceHash && (c.inviterDevices || []).includes(c.deviceHash)) {
    out.push({ code: "inviter_device", detail: { cluster: clusterLabel(c.deviceHash) } });
  }
  const sameDevice = c.deviceHash ? sibs.filter((s) => s.device_hash && s.device_hash === c.deviceHash).length : 0;
  if (sameDevice > 0) out.push({ code: "same_device", detail: { cluster: clusterLabel(c.deviceHash), others: sameDevice } });
  const sameNet =
    c.subnetHash &&
    ((c.inviterSubnets || []).includes(c.subnetHash) || sibs.some((s) => s.subnet_hash && s.subnet_hash === c.subnetHash));
  if (sameNet) out.push({ code: "same_subnet" });
  if (c.disposable) out.push({ code: "disposable_email" });
  return out;
}

/** Signals found at the first message. */
function messageSignals({ signupAt, at, peerIsInviter, rules }) {
  const out = [];
  const a = ms(signupAt);
  const b = ms(at);
  if (a != null && b != null && b - a < rules.fastMessageSeconds * 1000) {
    out.push({ code: "fast_first_message", detail: { seconds: Math.max(0, Math.round((b - a) / 1000)) } });
  }
  if (peerIsInviter) out.push({ code: "inviter_only" });
  return out;
}

/** Strongest configured action among the signals ("none" | "warn" | "hold" | "deny"). */
function decide(signals, rules) {
  let best = "none";
  for (const s of signals || []) {
    const a = rules.signals?.[s.code] || "none";
    if ((ACTION_RANK[a] || 0) > (ACTION_RANK[best] || 0)) best = a;
  }
  return best;
}

const SIGNAL_WEIGHT = { inviter_device: 45, same_device: 35, disposable_email: 30, fast_first_message: 20, same_subnet: 10, inviter_only: 8 };

/** 0..100 risk of one row from its signals. */
function rowRisk(signals) {
  let s = 0;
  for (const sig of signals || []) s += SIGNAL_WEIGHT[sig.code] || 0;
  return Math.min(100, s);
}

function hasSignal(row, code) {
  return Array.isArray(row?.risk_signals) && row.risk_signals.some((s) => s && s.code === code);
}

/**
 * 0..100 risk of an inviter from the shares of risky invitees and a low activation rate.
 * Bands: < 30 low, 30..59 medium, >= 60 high.
 */
function inviterRisk(rows) {
  const list = (rows || []).filter((r) => r && !r.legacy);
  const n = list.length;
  if (!n) return { score: 0, band: "low", counts: { devices: 0, disposable: 0, fast: 0, subnet: 0 } };
  const count = (code) => list.filter((r) => hasSignal(r, code)).length;
  const devices = list.filter((r) => hasSignal(r, "same_device") || hasSignal(r, "inviter_device")).length;
  const disposable = count("disposable_email");
  const fast = count("fast_first_message");
  const subnet = count("same_subnet");
  const active = list.filter((r) => r.status === "paid").length;
  const x = (3 * devices + 2.5 * disposable + 2 * fast + 0.6 * subnet) / n;
  let score = Math.round(100 * (1 - Math.exp(-x)));
  if (n >= 5) score += Math.round((1 - active / n) * 8);
  score = Math.max(0, Math.min(100, score));
  return { score, band: riskBand(score), counts: { devices, disposable, fast, subnet } };
}

function riskBand(score) {
  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  return "low";
}

/**
 * Burst check after a sign-up: `recent` sign-ups of this inviter inside the window against
 * the inviter's own hourly baseline. Flags when recent >= minSignups AND recent >= baseline
 * x multiplier AND at least two of the recent rows carry a hold / deny signal.
 */
function detectAnomaly({ recent, baselinePerWindow, riskyRecent }, rules) {
  const a = rules.anomaly || {};
  const base = Math.max(Number(baselinePerWindow) || 0, 1 / Math.max(1, a.multiplier || 6));
  const factor = recent / base;
  const flagged = recent >= (a.minSignups || 5) && factor >= (a.multiplier || 6) && riskyRecent >= 2;
  return { flagged, factor: Math.round(factor * 10) / 10 };
}

/** Paid rewards this calendar month (UTC) that paid the inviter side. */
function monthStartIso(now = Date.now()) {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

/** Milestones as the user sees them: reached / next / locked. */
function milestonesView(activeCount, rules, reachedRows = []) {
  const reached = new Map((reachedRows || []).filter((r) => !r.revoked_at).map((r) => [Number(r.milestone), r]));
  const list = (rules.milestones || []).map((m) => {
    const got = reached.get(m.at);
    return {
      at: m.at,
      amount: m.amount,
      kind: m.kind,
      reached: Boolean(got) || activeCount >= m.at,
      claimed: Boolean(got),
      left: Math.max(0, m.at - activeCount),
    };
  });
  const next = list.find((m) => !m.reached) || null;
  return { count: activeCount, next: next ? next.at : null, list };
}

/** Day buckets (UTC) for the last `days` days, oldest first. */
function dailySeries(timestamps, days = 12, now = Date.now()) {
  const out = new Array(days).fill(0);
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  const first = end.getTime() - (days - 1) * DAY;
  for (const ts of timestamps || []) {
    const t = ms(ts);
    if (t == null || t < first) continue;
    const i = Math.floor((t - first) / DAY);
    if (i >= 0 && i < days) out[i] += 1;
  }
  return out;
}

const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/**
 * The inviter's own funnel. `rows` are referral rows (inviter side), `opens` link opens.
 */
function personalFunnel({ rows = [], opens = [] }, now = Date.now()) {
  const live = rows.filter((r) => !r.legacy);
  const opened = opens.length;
  const signedUp = rows.length;
  const firstMessage = live.filter((r) => r.first_message_at).length + rows.filter((r) => r.legacy).length;
  const active = rows.filter((r) => r.status === "paid").length;
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  return {
    opened,
    openedToday: opens.filter((o) => (ms(o.opened_at) || 0) >= dayStart.getTime()).length,
    signedUp,
    firstMessage,
    active,
    rates: { signup: pct(signedUp, opened), firstMessage: pct(firstMessage, signedUp), active: pct(active, firstMessage) },
    series: {
      opened: dailySeries(opens.map((o) => o.opened_at), 12, now),
      signedUp: dailySeries(rows.map((r) => r.signup_at || r.created_at), 12, now),
      firstMessage: dailySeries(live.map((r) => r.first_message_at).filter(Boolean), 12, now),
      active: dailySeries(rows.filter((r) => r.status === "paid").map((r) => r.paid_at || r.created_at), 12, now),
    },
  };
}

/** Share of sign-ups per channel among rows with a known channel: [{ channel, signups, pct }]. */
function channelShare(rows) {
  const counts = new Map();
  let total = 0;
  for (const r of rows || []) {
    const c = normalizeChannel(r.channel);
    if (!c) continue;
    counts.set(c, (counts.get(c) || 0) + 1);
    total += 1;
  }
  return CHANNELS.filter((c) => counts.has(c))
    .map((c) => ({ channel: c, signups: counts.get(c), pct: Math.round((counts.get(c) / total) * 100) }))
    .sort((a, b) => b.signups - a.signups);
}

/** Admin channel scorecard: opens -> sign-ups -> active per channel. */
function channelScorecard({ rows = [], opens = [] }) {
  const out = new Map(CHANNELS.map((c) => [c, { channel: c, opens: 0, signups: 0, active: 0 }]));
  for (const o of opens) {
    const c = normalizeChannel(o.channel) || "link";
    out.get(c).opens += 1;
  }
  for (const r of rows) {
    const c = normalizeChannel(r.channel) || "link";
    out.get(c).signups += 1;
    if (r.status === "paid") out.get(c).active += 1;
  }
  return [...out.values()].filter((x) => x.opens || x.signups).sort((a, b) => b.opens - a.opens || b.signups - a.signups);
}

/** Admin funnel over a period. `baseline` = first-message rate of sign-ups without an invite. */
function adminFunnel({ rows = [], opens = [] }) {
  const live = rows.filter((r) => !r.legacy);
  const signups = rows.length;
  const firstMessage = live.filter((r) => r.first_message_at).length;
  const returned = live.filter((r) => r.returned_at || r.status === "paid").length;
  const paid = rows.filter((r) => r.status === "paid").length;
  const held = rows.filter((r) => r.status === "held").length;
  return {
    opened: opens.length,
    signups,
    firstMessage,
    returned,
    paid,
    held,
    rates: {
      signup: pct(signups, opens.length),
      firstMessage: pct(firstMessage, live.length),
      returned: pct(returned, firstMessage),
      paid: pct(paid, live.length),
    },
  };
}

/** Counts per signal in a period, with the action the rules give each. */
function shieldCounts(rows, rules) {
  const out = {};
  for (const code of Object.keys(rules.signals || {})) out[code] = { code, count: 0, action: rules.signals[code] };
  for (const r of rows || []) {
    for (const s of Array.isArray(r.risk_signals) ? r.risk_signals : []) {
      if (s && out[s.code]) out[s.code].count += 1;
    }
  }
  // "Aynı cihaz parmak izi" is one line in the draft: the inviter's own device folds into it.
  if (out.inviter_device && out.same_device) {
    out.same_device.count += out.inviter_device.count;
    delete out.inviter_device;
  }
  return Object.values(out);
}

/** Top inviters with their numbers and risk. sort: "active" | "signups". */
function topInviters(rows, opensByInviter, sort = "active", limit = 8) {
  const by = new Map();
  for (const r of rows || []) {
    const id = String(r.inviter_id);
    if (!by.has(id)) by.set(id, []);
    by.get(id).push(r);
  }
  const list = [...by.entries()].map(([id, list]) => {
    const active = list.filter((r) => r.status === "paid").length;
    const risk = inviterRisk(list);
    return {
      inviterId: id,
      opens: opensByInviter?.get?.(id) || 0,
      signups: list.length,
      firstMessage: list.filter((r) => r.first_message_at).length,
      active,
      held: list.filter((r) => r.status === "held").length,
      returnRate: list.length ? Math.round((active / list.length) * 100) : 0,
      risk: risk.score,
      band: risk.band,
    };
  });
  list.sort((a, b) => (sort === "signups" ? b.signups - a.signups || b.active - a.active : b.active - a.active || b.signups - a.signups));
  return list.slice(0, limit);
}

/** Whole-number DesCoin text for notices ("2.000" in tr). */
function formatAmount(n, lang = "tr") {
  const v = Math.round(Number(n) || 0);
  try {
    return new Intl.NumberFormat(lang === "pt-BR" ? "pt-BR" : lang, { maximumFractionDigits: 0 }).format(v);
  } catch {
    return String(v);
  }
}

module.exports = {
  HOUR,
  DAY,
  CHANNELS,
  STATUSES,
  normalizeChannel,
  hashOf,
  subnetOf,
  clusterLabel,
  emailDomain,
  timeline,
  evaluateUnlock,
  stageOf,
  statusView,
  signupSignals,
  messageSignals,
  decide,
  rowRisk,
  hasSignal,
  inviterRisk,
  riskBand,
  detectAnomaly,
  monthStartIso,
  milestonesView,
  dailySeries,
  personalFunnel,
  channelShare,
  channelScorecard,
  adminFunnel,
  shieldCounts,
  topInviters,
  formatAmount,
  pct,
};
