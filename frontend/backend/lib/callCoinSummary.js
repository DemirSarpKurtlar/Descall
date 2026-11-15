"use strict";

/**
 * End-of-call DesCoin summary (owner pick: draft C with B's receipt rows, Nov 2026).
 * Pure parts only, no I/O, so the runtime store (lib/callCoinSessions.js) and the
 * tests decide the same way:
 *   - one session per user and call context (DM peer, group, server voice channel),
 *     from join to leave, with the DesCoin earned in it per activity
 *   - the receipt number shown in the popup and written on every ledger row of the call
 *   - the near-cap warning (a daily cap at least 90% used)
 *   - the featured shop item (an active sale, limited stock or time-limited item the
 *     user does not own)
 *   - the payload of `descoin:call-summary`
 * Test: backend/lib/callCoinSummary.selftest.cjs
 */

const crypto = require("crypto");

const CONTEXTS = Object.freeze(["dm", "group", "server"]);
/** The client sends a heartbeat every ~16 s; one accepted beat = that much activity. */
const BEAT_SECONDS = 16;
const NEAR_CAP_RATIO = 0.9;
const DEFAULT_CAPS = Object.freeze({
  voice: 180,
  screenshare: 220,
  global: 400,
});
/** A featured item ending further away than this is not "time-limited". */
const TIMED_WINDOW_MS = 7 * 86_400_000;

function cleanId(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s && s.length <= 128 ? s : null;
}

/** "dm:<peerId>" | "group:<groupId>" | "server:<channelId>", or null when the context is not valid. */
function contextKey({ context, peerId, groupId, channelId } = {}) {
  if (context === "dm") return cleanId(peerId) ? `dm:${cleanId(peerId)}` : null;
  if (context === "group") return cleanId(groupId) ? `group:${cleanId(groupId)}` : null;
  if (context === "server") return cleanId(channelId) ? `server:${cleanId(channelId).toLowerCase()}` : null;
  return null;
}

function parseContextKey(key) {
  const m = /^(dm|group|server):(.+)$/.exec(String(key || ""));
  return m ? { context: m[1], targetId: m[2] } : null;
}

function newSessionId() {
  return crypto.randomUUID();
}

/** Short receipt number for one call session: "DC-" + 4 hex digits, stable per session. */
function receiptFor(sessionId) {
  const hex = crypto.createHash("sha256").update(String(sessionId || "")).digest("hex");
  return `DC-${hex.slice(0, 4).toUpperCase()}`;
}

function createSession({ userId, key, startedAt = Date.now(), id = newSessionId() } = {}) {
  const parsed = parseContextKey(key);
  if (!userId || !parsed) return null;
  return {
    id,
    receipt: receiptFor(id),
    userId: String(userId),
    key,
    context: parsed.context,
    targetId: parsed.targetId,
    startedAt: Number(startedAt) || Date.now(),
    earnedVoice: 0,
    earnedScreenshare: 0,
    voiceBeats: 0,
    screenBeats: 0,
    screenShared: false,
    hourCapReached: false,
    maxPeople: 0,
    lastBeatAt: null,
  };
}

/**
 * One accepted heartbeat (the server already checked seat / call / speaking). `credited`
 * is what creditCapped actually paid (0 at a cap); the activity still counts as time.
 */
function addBeat(session, { type, credited = 0, capped = null, people = 0, at = Date.now() } = {}) {
  if (!session) return session;
  const amount = Math.max(0, Math.floor(Number(credited) || 0));
  if (type === "voice") {
    session.voiceBeats += 1;
    session.earnedVoice += amount;
  } else if (type === "screenshare") {
    session.screenBeats += 1;
    session.earnedScreenshare += amount;
    session.screenShared = true;
  } else {
    return session;
  }
  if (capped === "hour") session.hourCapReached = true;
  const n = Math.max(0, Math.floor(Number(people) || 0));
  if (n > session.maxPeople) session.maxPeople = n;
  session.lastBeatAt = at;
  return session;
}

function earnedTotal(session) {
  return (session?.earnedVoice || 0) + (session?.earnedScreenshare || 0);
}

/** Only a session that earned something is summarised (the user's threshold is applied on the client). */
function shouldEmit(session) {
  return earnedTotal(session) > 0;
}

/**
 * Talk / share seconds from the accepted beats, never more than the call itself.
 * Returns { durationSec, talkSec, screenSec }.
 */
function sessionTimes(session, endedAt = Date.now()) {
  const durationSec = Math.max(0, Math.round((Number(endedAt) - Number(session?.startedAt || endedAt)) / 1000));
  const cap = (n) => Math.min(durationSec, Math.max(0, n));
  return {
    durationSec,
    talkSec: cap((session?.voiceBeats || 0) * BEAT_SECONDS),
    screenSec: cap((session?.screenBeats || 0) * BEAT_SECONDS),
  };
}

/**
 * The daily cap closest to full, when it is at least 90% used.
 * today = { voice, screenshare, global } earned today. Returns null or
 * { kind: "voice" | "screenshare" | "global", earned, cap, left }.
 */
function nearCapWarning(today = {}, caps = DEFAULT_CAPS) {
  const rows = [
    ["global", today.global, caps.global],
    ["voice", today.voice, caps.voice],
    ["screenshare", today.screenshare, caps.screenshare],
  ];
  let best = null;
  for (const [kind, earnedRaw, cap] of rows) {
    const earned = Math.max(0, Math.floor(Number(earnedRaw) || 0));
    if (!cap || earned / cap < NEAR_CAP_RATIO) continue;
    const ratio = earned / cap;
    if (!best || ratio > best.ratio) best = { kind, earned: Math.min(earned, cap), cap, left: Math.max(0, cap - earned), ratio };
  }
  if (!best) return null;
  const { ratio, ...out } = best;
  void ratio;
  return out;
}

function ms(v) {
  if (v == null || v === "") return null;
  const t = typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/** When the offer ends: the sooner of the sale end and the availability end. */
function offerEndsAt(item, now) {
  const ends = [ms(item?.sale_ends_at), ms(item?.available_until)].filter((t) => t != null && t > now);
  return ends.length ? Math.min(...ends) : null;
}

/**
 * Featured shop item for the summary. `items` are catalog items as listActiveItems
 * returns them (effective price in price_descoin, list price, discount, stock, ends).
 * Only items the user does not own, not sold out, paid, and with a reason to look now:
 * an active discount, limited stock or a time limit (within 7 days). Discounts win,
 * then limited stock, then the soonest end; affordable breaks ties. Null when none.
 */
function pickFeaturedItem(items = [], { ownedIds = [], balance = 0, now = Date.now() } = {}) {
  const owned = new Set((ownedIds || []).map(String));
  let best = null;
  for (const item of items || []) {
    if (!item || item.id == null || owned.has(String(item.id))) continue;
    if (item.sold_out) continue;
    const price = Math.max(0, Math.round(Number(item.price_descoin) || 0));
    if (price <= 0) continue;
    const pct = Math.max(0, Math.round(Number(item.discount_pct) || 0));
    const stockLeft = item.stock_left == null ? null : Math.max(0, Math.round(Number(item.stock_left) || 0));
    if (stockLeft === 0) continue;
    const endsAt = offerEndsAt(item, now);
    const timed = endsAt != null && endsAt - now <= TIMED_WINDOW_MS;
    if (!pct && stockLeft == null && !timed) continue;
    const affordable = Number(balance) >= price;
    let score = 0;
    if (pct) score += 1000 + pct * 5;
    if (stockLeft != null) score += 500 + (stockLeft <= 20 ? 100 : 0);
    if (timed) score += 300 + Math.max(0, 100 - Math.floor((endsAt - now) / 3_600_000));
    if (affordable) score += 50;
    const cand = { item, price, pct, stockLeft, endsAt: timed || pct ? endsAt : null, affordable, score };
    if (!best || cand.score > best.score || (cand.score === best.score && String(cand.item.id) < String(best.item.id))) best = cand;
  }
  if (!best) return null;
  const { item } = best;
  const listPrice = Math.max(best.price, Math.round(Number(item.list_price_descoin) || best.price));
  return {
    id: String(item.id),
    sku: item.sku || null,
    name: item.name || "",
    description: item.description || "",
    category: item.category || null,
    rarity: item.rarity || null,
    imageUrl: item.preview_url || item.asset_url || null,
    themeKey: item.theme_key || null,
    effectKey: item.effect_key || null,
    badgeIcon: item.badge_icon || null,
    countryCode: item.country_code || null,
    price: best.price,
    listPrice,
    discountPct: best.pct,
    stockLeft: best.stockLeft,
    endsAt: best.endsAt != null ? new Date(best.endsAt).toISOString() : null,
    kind: best.pct ? "sale" : best.stockLeft != null ? "limited" : "timed",
    affordable: best.affordable,
  };
}

/**
 * `descoin:call-summary` payload. `display` is only what the user could already see
 * in the call (peer / group / server + channel name and avatar), `today` the day's
 * earnings after the call, `origin` "self" (the device that left) or "server".
 */
function buildSummaryPayload(session, {
  endedAt = Date.now(),
  origin = "server",
  display = {},
  balance = 0,
  today = {},
  todayCap = DEFAULT_CAPS.global,
  caps = DEFAULT_CAPS,
  streakDays = 0,
  featuredItem = null,
} = {}) {
  const times = sessionTimes(session, endedAt);
  const total = earnedTotal(session);
  const todayEarned = Math.max(0, Math.floor(Number(today.global) || 0));
  const bal = Math.max(0, Math.floor(Number(balance) || 0));
  return {
    v: 1,
    sessionId: session.id,
    receipt: session.receipt,
    context: session.context,
    origin: origin === "self" ? "self" : "server",
    display: {
      id: display.id != null ? String(display.id) : session.targetId,
      name: display.name ? String(display.name).slice(0, 80) : null,
      avatarUrl: display.avatarUrl || null,
      serverId: display.serverId != null ? String(display.serverId) : null,
      serverName: display.serverName ? String(display.serverName).slice(0, 100) : null,
      channelName: display.channelName ? String(display.channelName).slice(0, 100) : null,
    },
    people: Math.max(session.maxPeople || 0, session.context === "dm" ? 2 : 0) || null,
    startedAt: new Date(session.startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    durationSec: times.durationSec,
    talkSec: times.talkSec,
    screenSec: times.screenSec,
    screenShared: Boolean(session.screenShared),
    earnedVoice: session.earnedVoice,
    earnedScreenshare: session.earnedScreenshare,
    earnedTotal: total,
    balance: bal,
    balanceBefore: Math.max(0, bal - total),
    todayEarned,
    todayBefore: Math.max(0, todayEarned - total),
    todayCap,
    streakDays: Math.max(0, Math.floor(Number(streakDays) || 0)),
    nearCap: nearCapWarning(today, caps),
    hourCapReached: Boolean(session.hourCapReached),
    featuredItem: featuredItem || null,
  };
}

module.exports = {
  CONTEXTS,
  BEAT_SECONDS,
  NEAR_CAP_RATIO,
  DEFAULT_CAPS,
  contextKey,
  parseContextKey,
  receiptFor,
  createSession,
  addBeat,
  earnedTotal,
  shouldEmit,
  sessionTimes,
  nearCapWarning,
  offerEndsAt,
  pickFeaturedItem,
  buildSummaryPayload,
};
