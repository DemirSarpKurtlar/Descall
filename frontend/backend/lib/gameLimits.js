"use strict";

/**
 * Personal game limits (Oyunlar / Kredi › Limitler, table user_game_limits) and
 * their enforcement in socket/gameHandlers.js:
 *
 *   max_bet          max credits per hand (a blackjack double counts as one hand)
 *   daily_loss_cap   stop for the day once the day's net loss reaches it
 *   daily_hand_cap   hands per day (the day starts at 00:00 Europe/Istanbul)
 *   transfers_enabled  false = /pay refused for this sender
 *   frozen_until / freeze_indefinite  no games and no transfers; credits are kept
 *   expires_at + auto_lift            caps and the transfer switch end on that date
 *   leaderboard_hidden                left out of /top, plays on as normal
 *
 * The global rules (10 to 25,000 per hand) still apply; the stricter one wins.
 * Missing table (migration not applied) = no limits, never an error for players.
 *
 * Bot replies carry an English fallback and an i18n ref into the app catalog
 * (gamesAdmin.bot.* in src/i18n/locales/gamesAdmin.<locale>.js); BOT_EN below is
 * the same English text (gamesLimits.selftest checks they match).
 */

const { istanbulDayStart, handDelta } = require("./casinoInsights");

const CACHE_MS = 30 * 1000;
const PAUSE_MS = 10 * 60 * 1000;
const FAR_FUTURE = "9999-12-31T00:00:00.000Z";

// Fallback text of the gamesAdmin.bot.* catalog (not API phrases: the app translates
// them from the message i18n ref, games.selftest.mjs checks they equal gamesAdmin.en.js).
const BOT_EN = Object.freeze({
  notice: `{main}{valid}`,
  validUntil: ` Your limits apply until {date}.`,
  frozenUntil: `Your games are paused until {until}. Your credits are kept.`,
  frozen: `Your games are paused. Your credits are kept.`,
  maxBet: `Your limit is {max} credits per hand.`,
  dailyLoss: `You reached today's loss limit ({cap} credits). Games open again tomorrow at 00:00.`,
  dailyLossLeft: `Today you can stake at most {left} more credits (daily loss limit {cap}).`,
  dailyHands: `You reached today's hand limit ({cap} hands). Games open again tomorrow at 00:00.`,
  transfersOff: `Sending credits with /pay is turned off for your account.`,
  creditTitle: `Game credits updated`,
  creditAdd: `{amount} credits were added to your game balance. New balance: {balance}. Reason: {reason}`,
  creditRemove: `{amount} credits were removed from your game balance. New balance: {balance}. Reason: {reason}`,
  creditSet: `Your game balance was set to {balance} credits. Reason: {reason}`,
  creditReset: `Your game balance was reset to {balance} credits. Reason: {reason}`,
});

let clientOverride = null;
let pausedUntil = 0;
let warned = false;
const cache = new Map();
let hiddenCache = { at: 0, ids: new Set() };

function db() {
  return clientOverride || require("../db/supabase");
}

function isMissingTable(err) {
  const msg = String(err?.message || "");
  return err?.code === "42P01" || err?.code === "PGRST205" || (/user_game_limit/.test(msg) && /does not exist|not find/i.test(msg));
}

function markMissing(err) {
  pausedUntil = Date.now() + PAUSE_MS;
  if (!warned) {
    warned = true;
    console.warn("[gameLimits] user_game_limits missing; apply supabase/migrations/20261115_games_credit_ledger.sql", err?.message || "");
  }
}

function available() {
  return Date.now() >= pausedUntil;
}

function intOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * What applies right now for a stored row (pure).
 * caps / transfers end at expires_at when auto_lift is on; the freeze has its own end.
 */
function activeLimits(row, now = Date.now()) {
  const t = typeof now === "number" ? now : new Date(now).getTime();
  if (!row) {
    return { maxBet: null, dailyLossCap: null, dailyHandCap: null, transfersEnabled: true, frozen: false, frozenUntil: null, indefinite: false, expiresAt: null, expired: false, leaderboardHidden: false, limited: false };
  }
  const expiresAt = row.expires_at || null;
  const expired = Boolean(expiresAt && row.auto_lift !== false && new Date(expiresAt).getTime() <= t);
  const indefinite = Boolean(row.freeze_indefinite);
  const frozenUntil = row.frozen_until || null;
  const frozen = indefinite || Boolean(frozenUntil && new Date(frozenUntil).getTime() > t);
  const maxBet = expired ? null : intOrNull(row.max_bet);
  const dailyLossCap = expired ? null : intOrNull(row.daily_loss_cap);
  const dailyHandCap = expired ? null : intOrNull(row.daily_hand_cap);
  const transfersEnabled = expired ? true : row.transfers_enabled !== false;
  return {
    maxBet,
    dailyLossCap,
    dailyHandCap,
    transfersEnabled,
    frozen,
    frozenUntil: frozen && !indefinite ? frozenUntil : null,
    indefinite: frozen && indefinite,
    expiresAt: expired ? null : expiresAt,
    expired,
    leaderboardHidden: Boolean(row.leaderboard_hidden),
    limited: Boolean(maxBet || dailyLossCap || dailyHandCap || !transfersEnabled),
  };
}

function ref(key, vars) {
  return vars ? { key: `gamesAdmin.bot.${key}`, vars } : { key: `gamesAdmin.bot.${key}` };
}

function fill(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars?.[k];
    if (v == null) return "";
    if (typeof v === "number") return v.toLocaleString("en-US");
    if (typeof v === "object" && typeof v.key === "string") return englishOf(v);
    if (typeof v === "object" && (v.date || v.dateTime)) {
      const d = new Date(v.date || v.dateTime);
      return Number.isFinite(d.getTime())
        ? d.toLocaleString("en-GB", v.dateTime ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" } : { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Istanbul" })
        : "";
    }
    return String(v);
  });
}

/** English text of a gamesAdmin.bot.* ref. */
function englishOf(r) {
  if (!r || typeof r.key !== "string") return "";
  const name = r.key.replace(/^gamesAdmin\.bot\./, "");
  return fill(BOT_EN[name] || r.key, r.vars);
}

/** Wraps a limit reason with the "valid until" tail: one ref the client translates. */
function notice(main, limits) {
  const valid = limits?.expiresAt ? ref("validUntil", { date: { date: limits.expiresAt } }) : "";
  return ref("notice", { main, valid });
}

/**
 * The message a player gets for a hand of `bet` (pure; usage = today's
 * { hands, loss }). Null = allowed. Order: freeze, hand count, loss cap, max bet.
 */
function playBlock(limits, bet, usage = { hands: 0, loss: 0 }) {
  if (!limits) return null;
  if (limits.frozen) {
    return notice(limits.indefinite ? ref("frozen") : ref("frozenUntil", { until: { dateTime: limits.frozenUntil } }), null);
  }
  if (limits.dailyHandCap && usage.hands >= limits.dailyHandCap) return notice(ref("dailyHands", { cap: limits.dailyHandCap }), limits);
  if (limits.dailyLossCap) {
    if (usage.loss >= limits.dailyLossCap) return notice(ref("dailyLoss", { cap: limits.dailyLossCap }), limits);
    const left = limits.dailyLossCap - usage.loss;
    if (bet > left) return notice(ref("dailyLossLeft", { left, cap: limits.dailyLossCap }), limits);
  }
  if (limits.maxBet && bet > limits.maxBet) return notice(ref("maxBet", { max: limits.maxBet }), limits);
  return null;
}

/** /pay refusal for the sender (pure). */
function transferBlock(limits) {
  if (!limits) return null;
  if (limits.frozen) return notice(limits.indefinite ? ref("frozen") : ref("frozenUntil", { until: { dateTime: limits.frozenUntil } }), null);
  if (!limits.transfersEnabled) return notice(ref("transfersOff"), limits);
  return null;
}

/**
 * The bot message shown in the admin preview for a form (pure): the first rule
 * the player would hit. Mirrors playBlock with a full day of play.
 */
function previewNotice(limits) {
  if (!limits) return null;
  if (limits.frozen) return playBlock(limits, 0);
  if (limits.dailyLossCap) return notice(ref("dailyLoss", { cap: limits.dailyLossCap }), limits);
  if (limits.dailyHandCap) return notice(ref("dailyHands", { cap: limits.dailyHandCap }), limits);
  if (limits.maxBet) return notice(ref("maxBet", { max: limits.maxBet }), limits);
  if (!limits.transfersEnabled) return notice(ref("transfersOff"), limits);
  return null;
}

async function loadRow(userId) {
  const id = String(userId || "");
  if (!id || !available()) return null;
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.row;
  try {
    const { data, error } = await db().from("user_game_limits").select("*").eq("user_id", id).maybeSingle();
    if (error) {
      if (isMissingTable(error)) markMissing(error);
      else console.warn("[gameLimits] read:", error.message || error);
      return hit ? hit.row : null;
    }
    cache.set(id, { at: Date.now(), row: data || null });
    return data || null;
  } catch (err) {
    console.warn("[gameLimits] read failed:", err?.message || err);
    return hit ? hit.row : null;
  }
}

/** Today's hands and net loss (Istanbul day) from game_history. */
async function dailyUsage(userId, now = Date.now()) {
  try {
    const since = new Date(istanbulDayStart(now)).toISOString();
    const { data, error } = await db()
      .from("game_history")
      .select("bet_amount, win_amount, played_at")
      .eq("user_id", String(userId))
      .gte("played_at", since)
      .limit(5000);
    if (error) throw error;
    const rows = data || [];
    const net = rows.reduce((s, r) => s + handDelta(r), 0);
    return { hands: rows.length, loss: Math.max(0, -net) };
  } catch (err) {
    console.warn("[gameLimits] usage:", err?.message || err);
    return { hands: 0, loss: 0 };
  }
}

/** Null when `userId` may play a hand of `bet`, else the bot ref to show. */
async function checkPlay(userId, bet) {
  const row = await loadRow(userId);
  if (!row) return null;
  const limits = activeLimits(row);
  if (!limits.frozen && !limits.maxBet && !limits.dailyLossCap && !limits.dailyHandCap) return null;
  const usage = limits.dailyLossCap || limits.dailyHandCap ? await dailyUsage(userId) : { hands: 0, loss: 0 };
  return playBlock(limits, Number(bet) || 0, usage);
}

/** Extra stake on a running hand (blackjack double): only the per-hand and loss caps. */
async function checkExtraStake(userId, totalBet, extra) {
  const row = await loadRow(userId);
  if (!row) return null;
  const limits = activeLimits(row);
  if (limits.maxBet && totalBet > limits.maxBet) return notice(ref("maxBet", { max: limits.maxBet }), limits);
  if (limits.dailyLossCap) {
    const usage = await dailyUsage(userId);
    // The running hand's first stake is not in game_history yet.
    const left = limits.dailyLossCap - usage.loss - (totalBet - extra);
    if (extra > left) return notice(ref("dailyLossLeft", { left: Math.max(0, left), cap: limits.dailyLossCap }), limits);
  }
  return null;
}

async function checkTransfer(userId) {
  const row = await loadRow(userId);
  return row ? transferBlock(activeLimits(row)) : null;
}

/** Users left out of /top (cached a minute). */
async function hiddenUserIds() {
  if (!available()) return hiddenCache.ids;
  if (Date.now() - hiddenCache.at < 60 * 1000) return hiddenCache.ids;
  try {
    const { data, error } = await db().from("user_game_limits").select("user_id").eq("leaderboard_hidden", true);
    if (error) {
      if (isMissingTable(error)) markMissing(error);
      return hiddenCache.ids;
    }
    hiddenCache = { at: Date.now(), ids: new Set((data || []).map((r) => String(r.user_id))) };
  } catch {
    /* keep the last list */
  }
  return hiddenCache.ids;
}

/** Every stored row (admin list: limited / frozen / hidden flags). */
async function listRows() {
  if (!available()) return { ready: false, rows: [] };
  const { data, error } = await db().from("user_game_limits").select("*").limit(10000);
  if (error) {
    if (isMissingTable(error)) {
      markMissing(error);
      return { ready: false, rows: [] };
    }
    throw error;
  }
  return { ready: true, rows: data || [] };
}

function unavailable() {
  const err = new Error("Game limits are not set up yet.");
  err.code = "LIMITS_UNAVAILABLE";
  err.status = 503;
  return err;
}

const FREEZE_IDS = Object.freeze(["none", "24h", "7d", "30d", "forever", "keep"]);

/**
 * Validated row from the admin form. Caps: 1..25,000 per hand (global max),
 * loss cap and hand cap positive or null (off). freeze: none | 24h | 7d | 30d |
 * forever | keep (leave a running freeze as it is).
 */
function normalizeInput(input, current, { now = Date.now(), maxBet: globalMax = 25000 } = {}) {
  const errors = [];
  const maxBet = intOrNull(input?.maxBet);
  if (maxBet != null && maxBet > globalMax) errors.push("maxBet");
  const dailyLossCap = intOrNull(input?.dailyLossCap);
  if (dailyLossCap != null && dailyLossCap > 10000000) errors.push("dailyLossCap");
  const dailyHandCap = intOrNull(input?.dailyHandCap);
  if (dailyHandCap != null && dailyHandCap > 100000) errors.push("dailyHandCap");
  const freeze = FREEZE_IDS.includes(input?.freeze) ? input.freeze : "keep";
  let frozenUntil = current?.frozen_until || null;
  let indefinite = Boolean(current?.freeze_indefinite);
  if (freeze === "none") {
    frozenUntil = null;
    indefinite = false;
  } else if (freeze === "forever") {
    frozenUntil = null;
    indefinite = true;
  } else if (freeze !== "keep") {
    const hours = { "24h": 24, "7d": 168, "30d": 720 }[freeze];
    frozenUntil = new Date(now + hours * 3600000).toISOString();
    indefinite = false;
  }
  let expiresAt = null;
  if (input?.expiresAt) {
    const d = new Date(input.expiresAt);
    if (!Number.isFinite(d.getTime())) errors.push("expiresAt");
    else if (d.getTime() <= now) errors.push("expiresAtPast");
    else expiresAt = d.toISOString();
  }
  const reason = String(input?.reason || "").trim();
  if (reason.length < 5) errors.push("reason");
  if (reason.length > 500) errors.push("reasonLong");
  return {
    errors,
    row: {
      max_bet: maxBet,
      daily_loss_cap: dailyLossCap,
      daily_hand_cap: dailyHandCap,
      transfers_enabled: input?.transfersEnabled !== false,
      frozen_until: frozenUntil,
      freeze_indefinite: indefinite,
      expires_at: expiresAt,
      auto_lift: input?.autoLift !== false,
      reason,
    },
  };
}

function publicRow(row) {
  if (!row) return null;
  return {
    maxBet: row.max_bet ?? null,
    dailyLossCap: row.daily_loss_cap ?? null,
    dailyHandCap: row.daily_hand_cap ?? null,
    transfersEnabled: row.transfers_enabled !== false,
    frozenUntil: row.frozen_until || null,
    freezeIndefinite: Boolean(row.freeze_indefinite),
    expiresAt: row.expires_at || null,
    autoLift: row.auto_lift !== false,
    leaderboardHidden: Boolean(row.leaderboard_hidden),
    reason: row.reason || null,
    setBy: row.set_by_username || null,
    updatedAt: row.updated_at || null,
  };
}

/** Upserts the limits row (+ a history row) and drops the caches. */
async function saveRow(userId, patch, actor, reason) {
  if (!available()) throw unavailable();
  const id = String(userId);
  const { data: current, error: readErr } = await db().from("user_game_limits").select("*").eq("user_id", id).maybeSingle();
  if (readErr) {
    if (isMissingTable(readErr)) {
      markMissing(readErr);
      throw unavailable();
    }
    throw readErr;
  }
  const nowIso = new Date().toISOString();
  const next = {
    ...(current || {}),
    ...patch,
    user_id: id,
    reason: reason || patch.reason || current?.reason || null,
    set_by: actor?.id || null,
    set_by_username: actor?.username || null,
    updated_at: nowIso,
  };
  if (!current) next.created_at = nowIso;
  const { data, error } = await db().from("user_game_limits").upsert(next, { onConflict: "user_id" }).select("*").single();
  if (error) {
    if (isMissingTable(error)) {
      markMissing(error);
      throw unavailable();
    }
    throw error;
  }
  cache.delete(id);
  hiddenCache = { at: 0, ids: hiddenCache.ids };
  const { error: histErr } = await db()
    .from("user_game_limit_history")
    .insert({
      user_id: id,
      limits: publicRow(data),
      previous: publicRow(current),
      reason: reason || patch.reason || null,
      actor_id: actor?.id || null,
      actor_username: actor?.username || null,
      created_at: nowIso,
    });
  if (histErr && !isMissingTable(histErr)) console.warn("[gameLimits] history:", histErr.message || histErr);
  return { row: data, previous: current || null };
}

async function history(userId, limit = 10) {
  if (!available()) return [];
  const { data, error } = await db()
    .from("user_game_limit_history")
    .select("id, limits, previous, reason, actor_username, created_at")
    .eq("user_id", String(userId))
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data || []).map((r) => ({ id: r.id, limits: r.limits, previous: r.previous, reason: r.reason, actor: r.actor_username, at: r.created_at }));
}

function _setClientForTests(client) {
  clientOverride = client;
  pausedUntil = 0;
  cache.clear();
  hiddenCache = { at: 0, ids: new Set() };
}

function forget(userId) {
  if (userId) cache.delete(String(userId));
  else cache.clear();
  hiddenCache = { at: 0, ids: hiddenCache.ids };
}

module.exports = {
  BOT_EN,
  FAR_FUTURE,
  FREEZE_IDS,
  activeLimits,
  playBlock,
  transferBlock,
  previewNotice,
  englishOf,
  checkPlay,
  checkExtraStake,
  checkTransfer,
  dailyUsage,
  hiddenUserIds,
  listRows,
  loadRow,
  normalizeInput,
  publicRow,
  saveRow,
  history,
  forget,
  isMissingTable,
  available,
  unavailable,
  _setClientForTests,
};
