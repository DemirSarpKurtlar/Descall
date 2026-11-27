"use strict";

/**
 * The 12 paywall moments of draft 5B ("Uygulamada nerede görünür") + the in-server paywall, with
 * their rule and frequency, and the daily reminder budget:
 *   - moments the system suggests: at most `paywall.perDay` (1) a day, never before the account is
 *     `paywall.minAccountHours` (48) old, and the same moment never twice within 24 h;
 *   - moments the person opens themselves (a tap on a locked thing): always answered, but the full
 *     offer is shown once a day per moment; after that a compact line (so the same offer is not
 *     repeated) - and never a dead end;
 *   - "once" moments: one time per account;
 *   - info moments (badges, store card, owner settings, gift status) are not offers and not counted.
 * "Hediye iste": `paywall.giftAskPerWeek` (1) a week; the recipient can turn asks off.
 * Every decision is tracked in premium_paywall_events (the admin funnel).
 */

const config = require("./config");

const MOMENTS = Object.freeze([
  { id: "file_too_big", n: 1, kind: "tap", who: ["me", "server"] },
  { id: "screen_quality", n: 2, kind: "tap", who: ["me", "server"] },
  { id: "locked_emoji", n: 3, kind: "tap", who: ["me", "server"] },
  { id: "profile_gif_note", n: 4, kind: "once", who: ["me", "friend"] },
  { id: "gif_upload", n: 5, kind: "tap", who: ["me", "friend"] },
  { id: "profile_card", n: 6, kind: "suggested", who: ["me", "server"] },
  { id: "boost_badge", n: 7, kind: "info", who: ["server"] },
  { id: "store_gift_card", n: 8, kind: "info", who: ["friend"] },
  { id: "server_settings", n: 9, kind: "info", who: ["server"] },
  { id: "streak_reward", n: 10, kind: "reward", who: ["me", "friend"] },
  { id: "gift_flow", n: 11, kind: "info", who: ["friend"] },
  { id: "trial", n: 12, kind: "once", who: ["me", "server"] },
  { id: "server_paywall", n: 0, kind: "tap", who: ["server", "me"] },
]);
const BY_ID = new Map(MOMENTS.map((m) => [m.id, m]));
const ACTIONS = Object.freeze(["shown", "compact", "clicked", "dismissed", "trial_started", "gift_requested", "first_frame", "checkout", "converted", "suppressed", "ceiling_exceeded"]);

function isMoment(id) {
  return BY_ID.has(String(id));
}

const DAY = 24 * 3600 * 1000;

/**
 * Decide what to show. Pure.
 *   recent: [{ moment, action, created_at }] of this user, newest first (last 8 days is enough)
 * Returns { show: 'full' | 'compact' | 'none', reason }.
 */
function decide({ moment, cfg, platform = "web", userId = null, plan = null, accountCreatedAt = null, recent = [], now = Date.now() }) {
  const m = BY_ID.get(String(moment));
  if (!m) return { show: "none", reason: "unknown_moment" };
  const c = cfg || config.DEFAULTS;
  if (!config.featureOn(c, "paywalls", platform, userId)) return { show: "none", reason: "off" };
  if (plan === "ultra" || (plan === "plus" && m.id !== "trial")) {
    if (m.kind === "info" || m.kind === "reward") return { show: "full", reason: "member_info" };
    return { show: "none", reason: "member" };
  }
  if (m.kind === "info" || m.kind === "reward") return { show: "full", reason: "info" };
  const shownKinds = new Set(["shown", "compact"]);
  const list = (Array.isArray(recent) ? recent : []).filter((e) => e && shownKinds.has(e.action));
  const at = (e) => new Date(e.created_at).getTime();
  if (m.kind === "once") {
    if (list.some((e) => e.moment === m.id && e.action === "shown")) return { show: "none", reason: "once" };
    return { show: "full", reason: "first" };
  }
  const sameRecent = list.some((e) => e.moment === m.id && e.action === "shown" && now - at(e) < DAY);
  if (m.kind === "tap") {
    return sameRecent ? { show: "compact", reason: "seen_today" } : { show: "full", reason: "tap" };
  }
  // suggested
  const created = accountCreatedAt ? new Date(accountCreatedAt).getTime() : null;
  if (!created || now - created < Number(c.paywall.minAccountHours) * 3600 * 1000) return { show: "none", reason: "new_account" };
  if (sameRecent) return { show: "none", reason: "seen_today" };
  const suggestedToday = list.filter((e) => BY_ID.get(e.moment)?.kind === "suggested" && e.action === "shown" && now - at(e) < DAY).length;
  if (suggestedToday >= Number(c.paywall.perDay)) return { show: "none", reason: "budget" };
  return { show: "full", reason: "suggested" };
}

/** Weekly gift-ask limit. asks = this sender's asks, newest first. */
function canAsk({ asks = [], cfg, now = Date.now(), recipientOptedOut = false }) {
  if (recipientOptedOut) return { ok: false, reason: "recipient_off" };
  const c = cfg || config.DEFAULTS;
  const week = 7 * DAY;
  const n = asks.filter((a) => now - new Date(a.created_at).getTime() < week).length;
  if (n >= Number(c.paywall.giftAskPerWeek)) {
    const oldest = asks.filter((a) => now - new Date(a.created_at).getTime() < week).map((a) => new Date(a.created_at).getTime()).sort((a, b) => a - b)[0];
    return { ok: false, reason: "weekly_limit", nextAt: new Date((oldest || now) + week).toISOString() };
  }
  return { ok: true };
}

/** Rows for the admin page: id, number, kind and the rule text key. */
function rules(cfg) {
  const c = cfg || config.DEFAULTS;
  return MOMENTS.map((m) => ({ ...m, perDay: m.kind === "suggested" ? c.paywall.perDay : null, minAccountHours: m.kind === "suggested" ? c.paywall.minAccountHours : null }));
}

/* ---------------- storage ---------------- */

let dbOverride = null;
const db = () => dbOverride || require("../../db/supabase");

async function recentFor(userId, { days = 8 } = {}) {
  try {
    const since = new Date(Date.now() - days * DAY).toISOString();
    const { data, error } = await db().from("premium_paywall_events").select("moment, action, created_at").eq("user_id", userId).gte("created_at", since).order("created_at", { ascending: false }).limit(200);
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanMeta(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  const out = {};
  for (const [k, v] of Object.entries(meta).slice(0, 12)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/.test(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 80);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

async function track(userId, { moment, action, platform = null, serverId = null, meta = {} }) {
  if (!isMoment(moment) || !ACTIONS.includes(action)) return false;
  try {
    const { error } = await db().from("premium_paywall_events").insert({
      user_id: userId,
      moment,
      action,
      platform: platform ? config.normalizePlatform(platform) : null,
      server_id: UUID.test(String(serverId || "")) ? serverId : null,
      meta: cleanMeta(meta),
    });
    return !error;
  } catch {
    return false;
  }
}

function __setDbForTests(client) {
  dbOverride = client;
}

module.exports = { MOMENTS, ACTIONS, isMoment, decide, canAsk, rules, recentFor, track, cleanMeta, __setDbForTests };
