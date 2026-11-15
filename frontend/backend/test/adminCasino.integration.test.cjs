"use strict";

/**
 * Oyunlar / Kredi (admin section casino) over real HTTP with the fake Supabase,
 * plus the game socket paths that enforce the personal limits and write the
 * credit ledger:
 *  - section: an admin without "casino" gets 403; writes need the step-up code
 *  - before the migration: list / workspace / ledger fall back to game_history,
 *    limits answer 503 LIMITS_UNAVAILABLE, games keep working
 *  - adjust: reason required, ledger row with the balance after, audit, notice
 *  - limits: saved with history, enforced in /bj, /slot, /cf and /pay with a
 *    gamesAdmin.bot.* bot reply; leaderboard hide filters /top
 *  - hands: replay data (steps + balance), fair play, one hand by id
 *  - overview: KPIs, per-game stats, anomalies; CSV exports
 */

process.env.NODE_ENV = "test";
process.env.PASSWORD_HIBP = "0";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.JWT_EXPIRES_IN = "7d";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER = id(1);
const CASINO = id(2); // admin granted casino
const MOD = id(3); // admin granted moderation only
const MERT = id(10);
const TOLGA = id(11);
const ZEYNEP = id(12);
const F1 = id(13);
const F2 = id(14);
const F3 = id(15);
const G1 = id(100);

const TOTP_ON = { totp_enabled_at: "2026-10-01T00:00:00.000Z", totp_secret_enc: "enc" };
function user(uid, username, extra = {}) {
  return {
    id: uid,
    username,
    display_name: username,
    email: `${username}@example.com`,
    email_confirmed_at: "2026-01-01T00:00:00.000Z",
    is_admin: false,
    is_banned: false,
    active_sessions: [{ id: `s-${username}` }],
    birth_date: "1990-01-01",
    created_at: "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}

const now = Date.now();
const ago = (min) => new Date(now - min * 60000).toISOString();
let handN = 0;
const hand = (uid, result, bet, win, min, game = "blackjack", extra = {}) => ({
  id: id(1000 + ++handN),
  user_id: uid,
  game_type: game,
  group_id: game === "blackjack" ? G1 : null,
  bet_amount: bet,
  result,
  win_amount: win,
  played_at: ago(min),
  player_hand:
    game === "blackjack"
      ? { cards: [{ rank: "A", suit: "♠", value: 11 }, { rank: "7", suit: "♦", value: 7 }, { rank: "3", suit: "♥", value: 3 }], value: 21, steps: ["deal", "hit", "stand"], balanceAfter: 12450 }
      : game === "coinflip"
        ? { call: "heads", face: "heads", rotations: 6 }
        : { grid: [["cherry", "bell", "queen"], ["cherry", "seven", "king"], ["bar", "ace", "queen"], ["bell", "bell", "king"], ["queen", "wild", "ace"]], freeSpins: 0 },
  dealer_hand: game === "blackjack" ? { cards: [{ rank: "9", suit: "♣", value: 9 }, { rank: "8", suit: "♠", value: 8 }], value: 17 } : null,
  ...extra,
});

const seedHands = [
  hand(MERT, "win", 2000, 4000, 12),
  hand(MERT, "loss", 1000, 0, 30),
  hand(MERT, "blackjack", 2000, 5000, 50),
  hand(MERT, "push", 1000, 1000, 70),
  hand(MERT, "win", 1000, 2000, 90, "coinflip"),
  hand(MERT, "loss", 500, 0, 3000, "slot"),
  ...Array.from({ length: 16 }, (_, i) => hand(TOLGA, "win", 1000, 2000, 200 - i)),
];

const missing = ["credit_ledger", "credit_transfers", "user_game_limits", "user_game_limit_history", "admin_user_notes"];
const fakeOpts = { missingTables: missing };
const fake = createFakeSupabase(
  {
    users: [
      user(OWNER, "admin", { is_admin: true, ...TOTP_ON }),
      user(CASINO, "kasa", { is_admin: true, admin_permissions: ["casino"], ...TOTP_ON }),
      user(MOD, "moddy", { is_admin: true, admin_permissions: ["moderation"], ...TOTP_ON }),
      user(MERT, "mertcan", { display_name: "Mert Can Aydın" }),
      user(TOLGA, "tolgahan"),
      user(ZEYNEP, "zeynep.ak", { birth_date: null }),
      user(F1, "farm1"),
      user(F2, "farm2"),
      user(F3, "farm3"),
    ],
    user_credits: [
      { id: id(500), user_id: MERT, credits: 12450, total_won: 0, total_lost: 0, games_played: 6, last_daily_claim: ago(60), created_at: ago(60 * 24 * 40) },
      { id: id(501), user_id: TOLGA, credits: 284500, total_won: 0, total_lost: 0, games_played: 16, created_at: ago(60 * 24 * 40) },
      { id: id(502), user_id: ZEYNEP, credits: 198750, total_won: 0, total_lost: 0, games_played: 0, created_at: ago(60 * 24 * 3) },
      { id: id(503), user_id: F1, credits: 1000, games_played: 0, created_at: ago(60) },
      { id: id(504), user_id: F2, credits: 1000, games_played: 0, created_at: ago(60) },
      { id: id(505), user_id: F3, credits: 1000, games_played: 0, created_at: ago(60) },
    ],
    game_history: seedHands,
    groups: [{ id: G1, name: "Gece Ders Kampı" }],
    credit_ledger: [],
    credit_transfers: [],
    user_game_limits: [],
    user_game_limit_history: [],
    admin_user_notes: [],
  },
  fakeOpts
);
// Rows come back as copies, like a real database.
{
  const realFrom = fake.from.bind(fake);
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  fake.from = (name) => {
    const q = realFrom(name);
    q.then = (res, rej) => {
      let r;
      try {
        r = q._run();
      } catch (err) {
        if (rej) rej(err);
        return;
      }
      res({ ...r, data: clone(r.data) });
    };
    return q;
  };
}
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken, signStepUpToken } = require("../config/jwt");
const adminRouter = require("../routes/admin");
const state = require("../runtime/sharedState");
const gameLimits = require("../lib/gameLimits");
const casinoLedger = require("../lib/casinoLedger");
const store = require("../lib/casinoAdminStore");
const access = require("../lib/casinoRoomAccess");
const games = require("../socket/gameHandlers");

access.setCasinoRoomAccessDeps({
  isGroupMember: async (g, u) => g === G1 && [MERT, TOLGA, ZEYNEP, F1].includes(u),
  channelAccess: async () => ({ ok: false }),
  isBanned: () => false,
  isTimedOut: () => false,
  isPairBlocked: async () => false,
  isFriend: async () => false,
});

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

const emitted = [];
const io = {
  to(room) {
    return { emit: (event, payload) => emitted.push({ room, event, payload }) };
  },
  in() {
    return { fetchSockets: async () => [] };
  },
  sockets: { sockets: new Map(), adapter: { rooms: new Map([[`user:${MERT}`, new Set(["x"])]]) } },
};

function makeSocket(uid, username) {
  const events = [];
  return {
    id: `sock-${uid}`,
    user: { id: uid, username },
    handshake: { auth: { platform: "electron" } },
    events,
    emit(name, payload) {
      events.push({ name, payload });
    },
    to() {
      return { emit() {} };
    },
    on() {},
  };
}

async function startServer() {
  const app = express();
  app.use(express.json());
  app.set("io", io);
  app.use("/api/admin", adminRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function call(base, method, path, { body, token, stepUp } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(stepUp ? { "X-Admin-Step-Up": stepUp } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let json = {};
  try {
    json = JSON.parse(raw);
  } catch {
    json = {};
  }
  return { status: res.status, body: json, raw };
}

const session = (uid, username) => signToken({ id: uid, username, sid: `s-${username}` });
const stepUpFor = (uid, username) => signStepUpToken({ id: uid, sid: `s-${username}` });
const lastAudit = (action) => state.auditLog.find((e) => e.action === action);
const rows = (t) => fake._tables[t].rows;
const lastGameMessage = (sock) => [...sock.events].reverse().find((e) => e.name === "game:message")?.payload?.message;

async function run() {
  const { server, base } = await startServer();
  const tok = session(CASINO, "kasa");
  const step = stepUpFor(CASINO, "kasa");
  const P = "/api/admin/credits/players";
  try {
    /* ---- 1. section ---- */
    let r = await call(base, "GET", P, { token: session(MOD, "moddy") });
    assert(r.status === 403 && r.body.section === "casino", "moderation-only admin refused " + r.raw);
    r = await call(base, "GET", P, { token: session(MERT, "mertcan") });
    assert(r.status === 403, "non-admin refused");

    /* ---- 2. before the migration: fallbacks ---- */
    r = await call(base, "GET", P, { token: tok });
    assert(r.status === 200, "list " + r.raw);
    assert(r.body.ready.ledger === false && r.body.ready.limits === false, "ready flags show the missing tables");
    assert(r.body.players[0].username === "tolgahan" && r.body.players[0].credits === 284500, "balance sort");
    const mert = r.body.players.find((p) => p.id === MERT);
    assert(mert.hands === 6 && mert.winRate === 50 && mert.lastPlayedAt, "hands + win rate " + JSON.stringify(mert));
    assert(r.body.players.find((p) => p.id === TOLGA).flags.risk === "high", "16 straight wins = risky");
    assert(r.body.counts.all === 6 && r.body.counts.risky >= 1, "counts " + JSON.stringify(r.body.counts));
    r = await call(base, "GET", `${P}?q=MERT`, { token: tok });
    assert(r.body.players.length === 1 && r.body.players[0].id === MERT, "search folds case");
    r = await call(base, "GET", `${P}?sort=hands`, { token: tok });
    assert(r.body.players[0].id === TOLGA, "hands sort");
    r = await call(base, "GET", `${P}?filter=risky`, { token: tok });
    assert(r.body.players.every((p) => p.flags.risk), "risky filter");

    r = await call(base, "GET", `${P}/${MERT}`, { token: tok });
    assert(r.status === 200, "workspace " + r.raw);
    assert(r.body.player.displayName === "Mert Can Aydın" && r.body.player.ageVerified === true, "player");
    assert(r.body.stats.hands === 6 && r.body.stats.winRate === 50, "stats " + JSON.stringify(r.body.stats));
    assert(r.body.stats.net30 === 2000 + -1000 + 3000 + 0 + 1000 - 500, "net 30 days from hands " + r.body.stats.net30);
    assert(r.body.series.length === 30 && r.body.series[29].balance === 12450, "30-day balance ends at the balance");
    assert(r.body.stats.lastContext && r.body.stats.lastContext.label === "Gece Ders Kampı", "last chat from the group " + JSON.stringify(r.body.stats.lastContext));
    assert(r.body.byGame.find((g) => g.game === "blackjack").hands === 4, "per game");
    assert(r.body.stats.rank === 3, "rank by balance " + r.body.stats.rank);
    assert(r.body.limits.ready === false, "limits not ready");
    r = await call(base, "GET", `${P}/${ZEYNEP}`, { token: tok });
    assert(r.body.player.ageVerified === false, "no birth date = not verified");

    r = await call(base, "GET", `${P}/${MERT}/ledger`, { token: tok });
    assert(r.body.source === "history" && r.body.entries.length === 6, "ledger from hands " + r.raw.slice(0, 300));
    assert(r.body.entries[0].balanceAfter === 12450 && r.body.entries[1].balanceAfter === 10450, "running balance walked back");

    r = await call(base, "PUT", `${P}/${MERT}/limits`, { token: tok, stepUp: step, body: { maxBet: 5000, reason: "Kullanıcı istedi" } });
    assert(r.status === 503 && r.body.code === "LIMITS_UNAVAILABLE", "limits before migration " + r.raw);

    // Games work without the new tables.
    const mertSock = makeSocket(MERT, "mertcan");
    await games.handleGameCommand(io, mertSock, MERT, "mertcan", G1, "/cf 100 heads");
    assert(lastGameMessage(mertSock)?.type === "game_end", "coin flip without the ledger table");

    /* ---- 3. migration applied ---- */
    fakeOpts.missingTables = ["admin_user_notes"];
    casinoLedger._setClientForTests(null);
    gameLimits._setClientForTests(null);
    store.invalidate();

    r = await call(base, "POST", `${P}/${MERT}/adjust`, { token: tok, body: { operation: "add", amount: 5000, reason: "Destek telafisi" } });
    assert(r.status === 403 && r.body.code === "STEP_UP_REQUIRED", "write needs step-up " + r.raw);
    r = await call(base, "POST", `${P}/${MERT}/adjust`, { token: tok, stepUp: step, body: { operation: "add", amount: 5000, reason: "x" } });
    assert(r.status === 400 && r.body.code === "REASON_REQUIRED", "reason required");
    r = await call(base, "POST", `${P}/${MERT}/adjust`, { token: tok, stepUp: step, body: { operation: "add", amount: 0, reason: "Destek telafisi" } });
    assert(r.status === 400 && r.body.code === "BAD_AMOUNT", "amount checked");
    const before = rows("user_credits").find((w) => w.user_id === MERT).credits;
    r = await call(base, "POST", `${P}/${MERT}/adjust`, { token: tok, stepUp: step, body: { operation: "add", amount: 5000, reason: "Destek telafisi #4821", category: "support", notify: true } });
    assert(r.status === 200 && r.body.newBalance === before + 5000 && r.body.notified === true, "adjust " + r.raw);
    const adminRow = rows("credit_ledger").find((e) => e.kind === "admin");
    assert(adminRow && adminRow.delta === 5000 && adminRow.balance_after === before + 5000 && adminRow.actor_username === "kasa" && adminRow.category === "support", "ledger row " + JSON.stringify(adminRow));
    assert(lastAudit("credits_update")?.meta.reason === "Destek telafisi #4821", "audited");
    assert(emitted.some((e) => e.event === "admin:update" && e.payload.type === "casino_credits"), "admin room told");
    const note = emitted.find((e) => e.event === "notification:new");
    assert(note && note.payload.notification.i18n.body.key === "gamesAdmin.bot.creditAdd" && /5,000 credits were added/.test(note.payload.notification.body), "player notice " + JSON.stringify(note?.payload));
    r = await call(base, "POST", `${P}/${MERT}/adjust`, { token: tok, stepUp: step, body: { operation: "remove", amount: 999999999, reason: "Kötüye kullanım" } });
    assert(r.status === 400, "cap on the amount");

    // Legacy endpoint (user file) writes the ledger too.
    r = await call(base, "POST", "/api/admin/credits/update", { token: tok, stepUp: step, body: { userId: MERT, amount: 100, operation: "remove" } });
    assert(r.status === 200 && r.body.newBalance === before + 4900, "legacy update " + r.raw);
    assert(rows("credit_ledger").filter((e) => e.kind === "admin").length === 2, "legacy update in the ledger");

    r = await call(base, "GET", `${P}/${MERT}/ledger`, { token: tok });
    assert(r.status === 200 && r.body.ready === true, "ledger " + r.raw.slice(0, 200));
    assert(r.body.entries[0].kind === "admin" && r.body.entries[0].balanceAfter === before + 4900 && r.body.entries[0].actor === "kasa", "newest = the admin change");
    assert(r.body.source === "mixed" && r.body.entries.some((e) => e.approximate), "older hands fill in");
    r = await call(base, "GET", `${P}/${MERT}/ledger?kind=admin`, { token: tok });
    assert(r.body.entries.length === 2 && r.body.entries.every((e) => e.kind === "admin"), "kind filter");

    /* ---- 4. limits ---- */
    const until = new Date(now + 16 * 86400000).toISOString();
    r = await call(base, "PUT", `${P}/${MERT}/limits`, { token: tok, stepUp: step, body: { maxBet: 5000, dailyLossCap: 20000, dailyHandCap: 200, transfersEnabled: false, freeze: "none", expiresAt: until, autoLift: true, reason: "Kullanıcı kendi isteğiyle sınır istedi" } });
    assert(r.status === 200 && r.body.limits.maxBet === 5000 && r.body.limits.transfersEnabled === false, "limits saved " + r.raw);
    assert(rows("user_game_limit_history").length === 1 && rows("user_game_limit_history")[0].actor_username === "kasa", "history row");
    assert(lastAudit("game_limits_set")?.meta.maxBet === 5000, "limits audited");
    r = await call(base, "PUT", `${P}/${MERT}/limits`, { token: tok, stepUp: step, body: { maxBet: 30000, reason: "too big" } });
    assert(r.status === 400 && r.body.fields.includes("maxBet"), "above the global max refused");

    await games.handleGameCommand(io, mertSock, MERT, "mertcan", G1, "/bj 6000");
    let msg = lastGameMessage(mertSock);
    assert(msg && msg.i18n?.content?.key === "gamesAdmin.bot.notice" && msg.i18n.content.vars.main.key === "gamesAdmin.bot.maxBet", "max bet enforced " + JSON.stringify(msg));
    assert(/5,000 credits per hand/.test(msg.content), "English fallback");
    await games.handleGameCommand(io, mertSock, MERT, "mertcan", G1, "/slot 6000");
    assert(lastGameMessage(mertSock).i18n.content.vars.main.key === "gamesAdmin.bot.maxBet", "slot enforced");
    await games.handleGameCommand(io, mertSock, MERT, "mertcan", G1, `/pay @tolgahan 100`);
    msg = lastGameMessage(mertSock);
    assert(msg.i18n.content.vars.main.key === "gamesAdmin.bot.transfersOff", "transfers off enforced");
    assert(!rows("credit_transfers").length, "no transfer row");

    const beforeCf = rows("user_credits").find((w) => w.user_id === MERT).credits;
    await games.handleGameCommand(io, mertSock, MERT, "mertcan", G1, "/cf 200 heads");
    msg = lastGameMessage(mertSock);
    assert(msg.type === "game_end", "small bets still play");
    const cfRow = rows("credit_ledger").find((e) => e.kind === "game" && e.game_type === "coinflip");
    const afterCf = rows("user_credits").find((w) => w.user_id === MERT).credits;
    assert(cfRow && cfRow.balance_after === afterCf && cfRow.delta === afterCf - beforeCf && cfRow.context_kind === "group" && cfRow.context_id === G1, "hand in the ledger " + JSON.stringify(cfRow));
    const cfHand = rows("game_history").find((h) => h.id === cfRow.ref_id);
    assert(cfHand && cfHand.player_hand.balanceAfter === afterCf, "history row has the balance after");

    // Freeze stops everything, keeps the credits.
    r = await call(base, "PUT", `${P}/${MERT}/limits`, { token: tok, stepUp: step, body: { freeze: "24h", transfersEnabled: true, reason: "Geçici dondurma" } });
    assert(r.status === 200 && r.body.limits.frozen === true, "frozen " + r.raw);
    await games.handleGameCommand(io, mertSock, MERT, "mertcan", G1, "/cf 100 heads");
    assert(lastGameMessage(mertSock).i18n.content.vars.main.key === "gamesAdmin.bot.frozenUntil", "freeze enforced");
    await games.handleGameCommand(io, mertSock, MERT, "mertcan", G1, `/pay @tolgahan 100`);
    assert(lastGameMessage(mertSock).i18n.content.vars.main.key === "gamesAdmin.bot.frozenUntil", "freeze blocks /pay");
    r = await call(base, "PUT", `${P}/${MERT}/limits`, { token: tok, stepUp: step, body: { freeze: "none", dailyHandCap: 1, reason: "El sınırı testi" } });
    await games.handleGameCommand(io, mertSock, MERT, "mertcan", G1, "/cf 100 heads");
    assert(lastGameMessage(mertSock).i18n.content.vars.main.key === "gamesAdmin.bot.dailyHands", "hand count enforced " + JSON.stringify(lastGameMessage(mertSock).i18n));

    // Transfers (another player): two ledger rows + a transfer row.
    const tolgaSock = makeSocket(TOLGA, "tolgahan");
    await games.handleGameCommand(io, tolgaSock, TOLGA, "tolgahan", G1, "/pay @zeynep.ak 300");
    assert(rows("credit_transfers").length === 1 && rows("credit_transfers")[0].amount === 300, "transfer row");
    const tIn = rows("credit_ledger").find((e) => e.kind === "transfer_in");
    const tOut = rows("credit_ledger").find((e) => e.kind === "transfer_out");
    assert(tIn && tOut && tIn.user_id === ZEYNEP && tOut.user_id === TOLGA && tIn.counterparty_id === TOLGA && tOut.delta === -300, "both sides in the ledger");

    // Daily bonus in the ledger.
    const zSock = makeSocket(ZEYNEP, "zeynep.ak");
    await games.handleGameCommand(io, zSock, ZEYNEP, "zeynep.ak", G1, "/daily");
    // Zeynep has no birth date: the age gate refuses before anything moves.
    assert(!rows("credit_ledger").some((e) => e.kind === "daily"), "age gate first");
    const f1Sock = makeSocket(F1, "farm1");
    await games.handleGameCommand(io, f1Sock, F1, "farm1", G1, "/daily");
    assert(rows("credit_ledger").some((e) => e.kind === "daily" && e.user_id === F1 && e.delta === 250 && e.balance_after === 1250), "daily bonus row");

    /* ---- 5. leaderboard hide ---- */
    r = await call(base, "PATCH", `${P}/${TOLGA}/flags`, { token: tok, stepUp: step, body: { leaderboardHidden: true, reason: "Şüpheli seri incelemede" } });
    assert(r.status === 200 && r.body.limits.leaderboardHidden === true, "hidden " + r.raw);
    assert(lastAudit("leaderboard_hide"), "hide audited");
    await games.handleGameCommand(io, mertSock, MERT, "mertcan", G1, "/top");
    msg = lastGameMessage(mertSock);
    assert(msg.type === "game_leaderboard" && !msg.gameData.leaders.some((l) => l.user_id === TOLGA), "hidden player not ranked");
    r = await call(base, "PATCH", `${P}/${TOLGA}/flags`, { token: tok, stepUp: step, body: { reason: "nothing" } });
    assert(r.status === 400 && r.body.code === "NO_CHANGE", "empty patch");

    /* ---- 6. hands + replay ---- */
    r = await call(base, "GET", `${P}/${MERT}/hands?days=all&limit=3`, { token: tok });
    assert(r.status === 200 && r.body.hands.length === 3 && r.body.hasMore === true, "hands page " + r.raw.slice(0, 200));
    assert(r.body.fairPlay && typeof r.body.fairPlay.winRate === "number" && r.body.fairPlay.status, "fair play");
    r = await call(base, "GET", `${P}/${MERT}/hands?days=all&game=blackjack&result=win`, { token: tok });
    assert(r.body.hands.length === 2 && r.body.hands.every((h) => h.gameType === "blackjack" && ["win", "blackjack"].includes(h.result)), "filters");
    const bj = r.body.hands[0];
    assert(bj.player.steps.join() === "deal,hit,stand" && bj.dealer.cards.length === 2 && bj.balanceAfter === 12450, "replay data");
    r = await call(base, "GET", `/api/admin/credits/hands/${bj.id}`, { token: tok });
    assert(r.status === 200 && r.body.hand.userId === MERT && r.body.hand.id === bj.id, "hand by id");
    r = await call(base, "GET", `/api/admin/credits/hands/${id(9999)}`, { token: tok });
    assert(r.status === 404, "unknown hand");

    /* ---- 7. workspace after the migration ---- */
    store.invalidate();
    r = await call(base, "GET", `${P}/${MERT}`, { token: tok });
    assert(r.body.limits.ready === true && r.body.limits.stored.dailyHandCap === 1 && r.body.flags.limited === true, "limits in the workspace " + JSON.stringify(r.body.limits));
    assert(r.body.limits.history.length >= 3, "limit history");
    assert(r.body.series.some((d) => d.admin === 4900), "admin change marked on the chart");
    r = await call(base, "GET", `${P}?filter=limited`, { token: tok });
    assert(r.body.players.length === 1 && r.body.players[0].id === MERT, "limited filter");
    r = await call(base, "GET", `${P}/${TOLGA}`, { token: tok });
    assert(r.body.stats.rank === null && r.body.flags.hidden === true, "hidden players have no rank");

    /* ---- 8. reset ---- */
    r = await call(base, "POST", `${P}/${MERT}/reset`, { token: tok, stepUp: step, body: { reason: "Hatalı çift ödeme" } });
    assert(r.status === 200 && r.body.newBalance === 1000, "reset " + r.raw);
    assert(rows("credit_ledger").some((e) => e.kind === "reset" && e.balance_after === 1000), "reset in the ledger");
    assert(lastAudit("credits_reset"), "reset audited");

    /* ---- 9. overview + exports + rules + notes ---- */
    r = await call(base, "GET", "/api/admin/credits/overview?days=30", { token: tok });
    assert(r.status === 200 && r.body.kpis.players === 6 && r.body.series.length === 30, "overview " + r.raw.slice(0, 200));
    assert(r.body.games.length === 3 && r.body.games[0].game === "blackjack" && r.body.games[0].biggestWin, "per game");
    assert(r.body.anomalies.some((a) => a.type === "streak" && a.user.username === "tolgahan"), "streak anomaly with the user");
    assert(r.body.leaderboard.find((l) => l.id === TOLGA).hidden === true, "leaderboard shows the hidden flag");
    assert(r.body.kpis.bonusToday >= 1, "daily bonus count");
    r = await call(base, "GET", `${P}/export`, { token: tok });
    assert(r.status === 200 && r.body.csv.startsWith("user_id,username,credits") && r.body.rows === 6, "players CSV");
    r = await call(base, "GET", `${P}/${MERT}/ledger/export`, { token: tok });
    assert(r.body.csv.split("\n").length > 3 && lastAudit("casino_export"), "ledger CSV audited");
    r = await call(base, "GET", `${P}/${MERT}/hands/export?days=all`, { token: tok });
    assert(/A♠ 7♦ 3♥/.test(r.body.csv), "hands CSV carries the cards");
    r = await call(base, "GET", "/api/admin/credits/rules", { token: tok });
    assert(r.body.minBet === 10 && r.body.maxBet === 25000 && r.body.dailyBonus === 250 && r.body.pointsOnly === true, "rules");
    r = await call(base, "POST", `${P}/${MERT}/notes`, { token: tok, stepUp: step, body: { body: "Destek talebi #4877" } });
    assert(r.status === 503 && r.body.code === "NOTES_UNAVAILABLE", "notes need their table " + r.raw);

    console.log("adminCasino integration test ok");
  } finally {
    server.close();
  }
}

run().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
