"use strict";

/**
 * Oyunlar / Kredi (admin section "casino"; owner pick Draft B "Oyuncu çalışma alanı").
 * Mounted inside routes/admin.js after requireAuth, requireAdmin, the admin rate
 * limit, requireAdmin2fa, requireStepUp (every POST / PUT / PATCH needs a fresh
 * code) and requireAdminSection (/credits/* = casino, lib/adminPermissions.js).
 *
 * Game credits are points only: never money, never DesCoin, never convertible.
 *
 *   GET   /credits/players                  list (search, filter, sort) + filter counts
 *   GET   /credits/players/export           CSV of every player (JSON { filename, csv })
 *   GET   /credits/players/:id              workspace (stats, 30-day balance, per game, limits)
 *   GET   /credits/players/:id/ledger       credit ledger with running balance
 *   GET   /credits/players/:id/ledger/export
 *   GET   /credits/players/:id/hands        hand-by-hand history + fair play summary
 *   GET   /credits/players/:id/hands/export
 *   GET   /credits/hands/:handId            one hand (deep link from "El bağlantısını kopyala")
 *   POST  /credits/players/:id/adjust       add / remove / set, reason required, optional notice
 *   POST  /credits/players/:id/reset        back to the starting balance, reason required
 *   PUT   /credits/players/:id/limits       personal limits (reason required)
 *   PATCH /credits/players/:id/flags        leaderboard hide / transfers switch (reason required)
 *   GET|POST /credits/players/:id/notes     admin notes (same table as the user file)
 *   GET   /credits/overview?days=           statistics page
 *   GET   /credits/rules                    the fixed game rules
 * Every change: state.appendAudit + admin room "admin:update".
 */

const express = require("express");
const supabase = require("../db/supabase");
const state = require("../runtime/sharedState");
const store = require("../lib/casinoAdminStore");
const insights = require("../lib/casinoInsights");
const casinoLedger = require("../lib/casinoLedger");
const gameLimits = require("../lib/gameLimits");
const { apiError } = require("../lib/apiError");

const router = express.Router();

const REASON_MIN = 5;
const REASON_MAX = 500;
const MAX_ADJUST = 10000000;
const CATEGORIES = Object.freeze(["support", "event", "bugfix", "abuse", "other"]);

function games() {
  return require("../socket/gameHandlers");
}

function audit(actor, action, target, meta) {
  return state.appendAudit(actor.id, actor.username, action, target, meta);
}

function notifyAdmins(req, payload) {
  try {
    const { notifyAdminRoom } = require("../socket/adminHandlers");
    const io = req.app.get("io");
    if (io) notifyAdminRoom(io, payload);
  } catch {
    /* no io in tests */
  }
}

function fail(res, err, fallback) {
  const status = err?.status || 500;
  if (status >= 500 && status !== 503) console.error("[adminCasino]", fallback, err?.message || err);
  return res.status(status).json({ error: status === 500 ? fallback : err.message || fallback, code: err?.code });
}

function cleanReason(v) {
  const s = String(v || "").trim();
  if (s.length < REASON_MIN) return { error: "REASON_REQUIRED" };
  if (s.length > REASON_MAX) return { error: "REASON_TOO_LONG" };
  return { value: s };
}

function badId(res) {
  return res.status(400).json(apiError("Invalid user."));
}

async function userExists(id) {
  const { data, error } = await supabase.from("users").select("id, username").eq("id", id).maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * In-app notification about a credit change, translated by the viewer's app
 * (gamesAdmin.bot.* refs) with the English text as fallback for old clients.
 */
function notifyPlayer(req, userId, key, vars) {
  try {
    const io = req.app.get("io");
    const titleRef = { key: "gamesAdmin.bot.creditTitle" };
    const bodyRef = { key: `gamesAdmin.bot.${key}`, vars };
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: "game_credits",
      title: gameLimits.englishOf(titleRef),
      body: gameLimits.englishOf(bodyRef),
      i18n: { title: titleRef, body: bodyRef },
      read: false,
      createdAt: new Date().toISOString(),
      meta: { balance: vars.balance },
    };
    const list = state.notificationsByUser.get(userId) || [];
    list.unshift(entry);
    if (list.length > 100) list.length = 100;
    state.notificationsByUser.set(userId, list);
    if (io) require("../lib/messageFanout").emitToUserRoom(io, userId, "notification:new", { notification: entry });
    return true;
  } catch (err) {
    console.warn("[adminCasino] notify:", err?.message || err);
    return false;
  }
}

/**
 * Sets a wallet under the game credit lock (same lock as hands and /pay).
 * op: add | remove | set. A user without a wallet starts from the starting balance.
 */
async function changeWallet(userId, op, amount) {
  const { withCreditLock, STARTING_CREDITS } = games();
  return withCreditLock(userId, async () => {
    const { data: current, error } = await supabase.from("user_credits").select("credits").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    const before = current ? Number(current.credits) || 0 : STARTING_CREDITS;
    let after = before;
    if (op === "add") after = before + amount;
    else if (op === "remove") after = Math.max(0, before - amount);
    else after = Math.max(0, amount);
    const { data: saved, error: upErr } = await supabase
      .from("user_credits")
      .upsert({ user_id: userId, credits: after, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
      .select("user_id, credits")
      .single();
    if (upErr) throw upErr;
    return { before, after: Number(saved?.credits ?? after) };
  });
}

/** Shared by POST /credits/update (legacy body) and POST /credits/players/:id/adjust. */
async function adjustCredits(req, { userId, operation, amount, reason, category, notify, kind = "admin" }) {
  const { before, after } = await changeWallet(userId, operation, amount);
  const delta = after - before;
  await casinoLedger.record({
    userId,
    kind,
    delta,
    balanceAfter: after,
    actor: req.user,
    reason,
    category: category || null,
    meta: { operation, amount },
  });
  audit(req.user, kind === "reset" ? "credits_reset" : "credits_update", userId, {
    operation,
    amount,
    previousBalance: before,
    newBalance: after,
    category: category || null,
    reason,
    notified: Boolean(notify),
  });
  notifyAdmins(req, { type: "casino_credits", userId, balance: after });
  store.invalidate();
  let notified = false;
  if (notify) {
    const key = kind === "reset" ? "creditReset" : { add: "creditAdd", remove: "creditRemove", set: "creditSet" }[operation];
    notified = notifyPlayer(req, userId, key, { amount: Math.abs(delta), balance: after, reason });
  }
  return { previousBalance: before, newBalance: after, delta, notified };
}

router.post("/credits/players/:id/adjust", async (req, res) => {
  const id = String(req.params.id || "");
  if (!store.isUuid(id)) return badId(res);
  const operation = req.body?.operation;
  if (!["add", "remove", "set"].includes(operation)) return res.status(400).json(apiError("Operation must be add, remove or set.", undefined, { code: "BAD_OPERATION" }));
  const amount = Math.floor(Number(req.body?.amount));
  if (!Number.isFinite(amount) || amount < (operation === "set" ? 0 : 1) || amount > MAX_ADJUST) {
    return res.status(400).json(apiError("Enter an amount between 1 and 10,000,000.", undefined, { code: "BAD_AMOUNT" }));
  }
  const reason = cleanReason(req.body?.reason);
  if (reason.error) return res.status(400).json(apiError("Write a reason of at least 5 characters.", undefined, { code: reason.error }));
  const category = CATEGORIES.includes(req.body?.category) ? req.body.category : null;
  try {
    if (!(await userExists(id))) return res.status(404).json(apiError("User not found."));
    const out = await adjustCredits(req, { userId: id, operation, amount, reason: reason.value, category, notify: Boolean(req.body?.notify) });
    res.json({ ok: true, userId: id, ...out });
  } catch (err) {
    fail(res, err, "Could not change the credits.");
  }
});

router.post("/credits/players/:id/reset", async (req, res) => {
  const id = String(req.params.id || "");
  if (!store.isUuid(id)) return badId(res);
  const reason = cleanReason(req.body?.reason);
  if (reason.error) return res.status(400).json(apiError("Write a reason of at least 5 characters.", undefined, { code: reason.error }));
  try {
    if (!(await userExists(id))) return res.status(404).json(apiError("User not found."));
    const { STARTING_CREDITS } = games();
    const out = await adjustCredits(req, { userId: id, operation: "set", amount: STARTING_CREDITS, reason: reason.value, category: "other", notify: Boolean(req.body?.notify), kind: "reset" });
    res.json({ ok: true, userId: id, ...out });
  } catch (err) {
    fail(res, err, "Could not reset the balance.");
  }
});

router.get("/credits/players", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(await store.listPlayers({ q: req.query.q, filter: req.query.filter, sort: req.query.sort, limit: req.query.limit, offset: req.query.offset }));
  } catch (err) {
    fail(res, err, "Could not load the players.");
  }
});

router.get("/credits/players/export", async (req, res) => {
  try {
    const out = await store.listPlayers({ q: req.query.q, filter: req.query.filter, sort: req.query.sort, limit: 5000 });
    const csv = insights.toCsv(out.players, [
      { label: "user_id", key: "id" },
      { label: "username", key: "username" },
      { label: "credits", key: "credits" },
      { label: "hands", key: "hands" },
      { label: "win_rate_pct", key: "winRate" },
      { label: "last_played_at", key: "lastPlayedAt" },
      { label: "risk", get: (r) => r.flags.risk || "" },
      { label: "limited", get: (r) => (r.flags.limited ? "yes" : "no") },
      { label: "frozen", get: (r) => (r.flags.frozen ? "yes" : "no") },
      { label: "leaderboard_hidden", get: (r) => (r.flags.hidden ? "yes" : "no") },
    ]);
    audit(req.user, "casino_export", "players", { rows: out.players.length, filter: req.query.filter || "all" });
    res.json({ filename: `game-credits-players-${new Date().toISOString().slice(0, 10)}.csv`, csv, rows: out.players.length });
  } catch (err) {
    fail(res, err, "Could not export the players.");
  }
});

router.get("/credits/overview", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(await store.overview({ days: req.query.days }));
  } catch (err) {
    fail(res, err, "Could not load the game statistics.");
  }
});

router.get("/credits/rules", (_req, res) => {
  const { MIN_BET, MAX_BET, STARTING_CREDITS, DAILY_BONUS } = games();
  const { LINE_COUNT } = require("../games/SlotGame");
  res.json({
    minBet: MIN_BET,
    maxBet: MAX_BET,
    startingCredits: STARTING_CREDITS,
    dailyBonus: DAILY_BONUS,
    blackjack: { decks: 6, dealerHitsSoft17: true, blackjackPays: "3:2", double: "first two cards" },
    slot: { lines: LINE_COUNT, reels: 5 },
    coinflip: { pays: "2x" },
    idleHandMinutes: 10,
    pointsOnly: true,
  });
});

router.get("/credits/hands/:handId", async (req, res) => {
  try {
    const hand = await store.handById(String(req.params.handId || ""));
    if (!hand) return res.status(404).json(apiError("Hand not found.", undefined, { code: "HAND_NOT_FOUND" }));
    res.json({ hand });
  } catch (err) {
    fail(res, err, "Could not load the hand.");
  }
});

router.get("/credits/players/:id", async (req, res) => {
  const id = String(req.params.id || "");
  if (!store.isUuid(id)) return badId(res);
  try {
    res.set("Cache-Control", "no-store");
    const data = await store.playerWorkspace(id, { openHands: games().openHandsFor(id) });
    if (!data) return res.status(404).json(apiError("User not found."));
    res.json(data);
  } catch (err) {
    fail(res, err, "Could not load the player.");
  }
});

router.get("/credits/players/:id/ledger", async (req, res) => {
  const id = String(req.params.id || "");
  if (!store.isUuid(id)) return badId(res);
  try {
    res.set("Cache-Control", "no-store");
    res.json(await store.playerLedger(id, { kind: req.query.kind, limit: req.query.limit, before: req.query.before || null, balance: req.query.balance ?? null }));
  } catch (err) {
    fail(res, err, "Could not load the credit ledger.");
  }
});

router.get("/credits/players/:id/ledger/export", async (req, res) => {
  const id = String(req.params.id || "");
  if (!store.isUuid(id)) return badId(res);
  try {
    const out = await store.playerLedger(id, { kind: req.query.kind || "all", limit: 2000 });
    const csv = insights.toCsv(out.entries, [
      { label: "at", key: "at" },
      { label: "kind", key: "kind" },
      { label: "game", key: "gameType" },
      { label: "result", key: "result" },
      { label: "stake", key: "bet" },
      { label: "delta", key: "delta" },
      { label: "balance_after", key: "balanceAfter" },
      { label: "counterparty", get: (e) => e.counterparty?.username || "" },
      { label: "admin", key: "actor" },
      { label: "reason", key: "reason" },
      { label: "chat", get: (e) => (e.context ? `${e.context.kind}:${e.context.label || e.context.id || ""}` : "") },
      { label: "approximate", get: (e) => (e.approximate ? "yes" : "") },
    ]);
    audit(req.user, "casino_export", id, { what: "ledger", rows: out.entries.length });
    res.json({ filename: `game-credit-ledger-${id.slice(0, 8)}.csv`, csv, rows: out.entries.length });
  } catch (err) {
    fail(res, err, "Could not export the credit ledger.");
  }
});

router.get("/credits/players/:id/hands", async (req, res) => {
  const id = String(req.params.id || "");
  if (!store.isUuid(id)) return badId(res);
  try {
    res.set("Cache-Control", "no-store");
    res.json(
      await store.playerHands(id, {
        game: req.query.game,
        result: req.query.result,
        days: req.query.days === "all" ? 0 : req.query.days ?? 7,
        limit: req.query.limit,
        before: req.query.before || null,
        openHands: games().openHandsFor(id),
      })
    );
  } catch (err) {
    fail(res, err, "Could not load the hands.");
  }
});

router.get("/credits/players/:id/hands/export", async (req, res) => {
  const id = String(req.params.id || "");
  if (!store.isUuid(id)) return badId(res);
  try {
    const out = await store.playerHands(id, { game: req.query.game, result: req.query.result, days: req.query.days === "all" ? 0 : req.query.days ?? 7, limit: 2000 });
    const cards = (h) => (Array.isArray(h?.cards) ? h.cards.map((c) => `${c.rank}${c.suit}`).join(" ") : "");
    const csv = insights.toCsv(out.hands, [
      { label: "hand_id", key: "id" },
      { label: "at", key: "at" },
      { label: "game", key: "gameType" },
      { label: "stake", key: "bet" },
      { label: "result", key: "result" },
      { label: "paid_back", key: "winAmount" },
      { label: "delta", key: "delta" },
      { label: "balance_after", key: "balanceAfter" },
      { label: "player", get: (h) => (h.gameType === "coinflip" ? `${h.player?.call || ""}/${h.player?.face || ""}` : cards(h.player)) },
      { label: "dealer", get: (h) => cards(h.dealer) },
    ]);
    audit(req.user, "casino_export", id, { what: "hands", rows: out.hands.length });
    res.json({ filename: `game-hands-${id.slice(0, 8)}.csv`, csv, rows: out.hands.length });
  } catch (err) {
    fail(res, err, "Could not export the hands.");
  }
});

router.put("/credits/players/:id/limits", async (req, res) => {
  const id = String(req.params.id || "");
  if (!store.isUuid(id)) return badId(res);
  try {
    if (!(await userExists(id))) return res.status(404).json(apiError("User not found."));
    const current = await gameLimits.loadRow(id);
    const { MAX_BET } = games();
    const { errors, row } = gameLimits.normalizeInput(req.body || {}, current, { maxBet: MAX_BET });
    if (errors.length) {
      const msg = errors.includes("reason") ? apiError("Write a reason of at least 5 characters.") : apiError("Check the limit values.");
      return res.status(400).json({ ...msg, code: errors.includes("reason") ? "REASON_REQUIRED" : "BAD_LIMITS", fields: errors });
    }
    const { row: saved, previous } = await gameLimits.saveRow(id, row, req.user, row.reason);
    const pub = gameLimits.publicRow(saved);
    audit(req.user, "game_limits_set", id, {
      maxBet: pub.maxBet,
      dailyLossCap: pub.dailyLossCap,
      dailyHandCap: pub.dailyHandCap,
      transfersEnabled: pub.transfersEnabled,
      frozenUntil: pub.frozenUntil,
      freezeIndefinite: pub.freezeIndefinite,
      expiresAt: pub.expiresAt,
      autoLift: pub.autoLift,
      reason: row.reason,
      previous: gameLimits.publicRow(previous),
    });
    notifyAdmins(req, { type: "casino_limits", userId: id });
    store.invalidate();
    res.json({ ok: true, limits: { ...gameLimits.activeLimits(saved), stored: pub, history: await gameLimits.history(id, 5) } });
  } catch (err) {
    fail(res, err, "Could not save the limits.");
  }
});

router.patch("/credits/players/:id/flags", async (req, res) => {
  const id = String(req.params.id || "");
  if (!store.isUuid(id)) return badId(res);
  const patch = {};
  if (typeof req.body?.leaderboardHidden === "boolean") patch.leaderboard_hidden = req.body.leaderboardHidden;
  if (typeof req.body?.transfersEnabled === "boolean") patch.transfers_enabled = req.body.transfersEnabled;
  if (!Object.keys(patch).length) return res.status(400).json(apiError("Nothing to change.", undefined, { code: "NO_CHANGE" }));
  const reason = cleanReason(req.body?.reason);
  if (reason.error) return res.status(400).json(apiError("Write a reason of at least 5 characters.", undefined, { code: reason.error }));
  try {
    if (!(await userExists(id))) return res.status(404).json(apiError("User not found."));
    const { row } = await gameLimits.saveRow(id, patch, req.user, reason.value);
    const action = "leaderboard_hidden" in patch ? (patch.leaderboard_hidden ? "leaderboard_hide" : "leaderboard_show") : patch.transfers_enabled ? "credit_transfers_on" : "credit_transfers_off";
    audit(req.user, action, id, { reason: reason.value });
    notifyAdmins(req, { type: "casino_limits", userId: id });
    store.invalidate();
    res.json({ ok: true, limits: { ...gameLimits.activeLimits(row), stored: gameLimits.publicRow(row) } });
  } catch (err) {
    fail(res, err, "Could not save the change.");
  }
});

router.get("/credits/players/:id/notes", async (req, res) => {
  const id = String(req.params.id || "");
  if (!store.isUuid(id)) return badId(res);
  res.set("Cache-Control", "no-store");
  res.json(await require("../lib/userDossierSections").listNotes(id, { limit: 20 }));
});

router.post("/credits/players/:id/notes", async (req, res) => {
  const id = String(req.params.id || "");
  if (!store.isUuid(id)) return badId(res);
  try {
    const note = await require("../lib/userDossierSections").addNote(id, { body: req.body?.body, actor: req.user });
    audit(req.user, "user_note_add", id, { length: note.body.length, from: "casino" });
    notifyAdmins(req, { type: "user_note", userId: id });
    res.status(201).json({ ok: true, note });
  } catch (err) {
    const status = err?.status || (err?.code === "NOTES_UNAVAILABLE" ? 503 : 500);
    res.status(status).json(err?.status ? { error: err.message, code: err?.code } : apiError("Could not save the note.", undefined, { code: err?.code }));
  }
});

module.exports = router;
module.exports.adjustCredits = adjustCredits;
module.exports.CATEGORIES = CATEGORIES;
