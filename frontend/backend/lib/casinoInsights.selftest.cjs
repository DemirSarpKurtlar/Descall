"use strict";

/**
 * Oyunlar / Kredi pure parts: hand summaries, per-game stats, anomalies, series,
 * ledger fallback, CSV, game limit rules and their bot messages, ledger rows.
 *   node backend/lib/casinoInsights.selftest.cjs
 */

const assert = require("assert");
const I = require("./casinoInsights");
const L = require("./gameLimits");
const ledger = require("./casinoLedger");

const DAY = 86400000;
const NOW = Date.parse("2026-11-14T18:00:00.000Z"); // 21:00 Istanbul
const at = (minAgo) => new Date(NOW - minAgo * 60000).toISOString();
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const hand = (user, result, bet, win, minAgo, game = "blackjack") => ({ id: `${user}-${minAgo}-${result}`, user_id: user, game_type: game, bet_amount: bet, win_amount: win, result, played_at: at(minAgo) });

/* ---- Istanbul day ---- */
assert.strictEqual(new Date(I.istanbulDayStart(NOW)).toISOString(), "2026-11-13T21:00:00.000Z", "Istanbul midnight");
assert.strictEqual(I.istanbulDayKey("2026-11-13T21:30:00.000Z"), "2026-11-14", "after 00:00 Istanbul is the next day");
assert.strictEqual(I.istanbulDayKey("2026-11-13T20:59:00.000Z"), "2026-11-13");

/* ---- summaries ---- */
const rows = [hand(A, "win", 100, 200, 50), hand(A, "blackjack", 100, 250, 40), hand(A, "loss", 200, 0, 30), hand(A, "push", 100, 100, 20), hand(B, "loss", 50, 0, 10)];
const sum = I.summarizeHands(rows);
assert.deepStrictEqual(
  { hands: sum.get(A).hands, wins: sum.get(A).wins, pushes: sum.get(A).pushes, losses: sum.get(A).losses, net: sum.get(A).net },
  { hands: 4, wins: 2, pushes: 1, losses: 1, net: 50 }
);
assert.strictEqual(I.winRate(sum.get(A)), 50);
assert.strictEqual(I.winRate(null), null);
assert.strictEqual(sum.get(A).lastAt, at(20));

/* ---- streak: a push does not break it, a loss does ---- */
const streakRows = [hand(A, "win", 1, 2, 9), hand(A, "push", 1, 1, 8), hand(A, "win", 1, 2, 7), hand(A, "loss", 1, 0, 6), hand(A, "win", 1, 2, 5)];
assert.strictEqual(I.longestWinStreak(streakRows), 2);

/* ---- per game ---- */
const gs = I.gameStats([...rows, hand(C, "win", 1000, 2000, 5, "coinflip"), hand(C, "loss", 500, 0, 4, "slot")], new Map([[C, "cem"], [A, "ali"]]));
const bj = gs.find((g) => g.game === "blackjack");
assert.strictEqual(bj.hands, 5);
assert.strictEqual(bj.winPct, 40);
assert.strictEqual(bj.pushPct, 20);
assert.strictEqual(bj.lossPct, 40);
assert.strictEqual(bj.staked, 550);
assert.strictEqual(bj.houseEdge, Math.round(((550 - 550) / 550) * 1000) / 10);
assert.strictEqual(bj.biggestWin.amount, 150);
assert.strictEqual(bj.biggestWin.username, "ali");
const cf = gs.find((g) => g.game === "coinflip");
assert.strictEqual(cf.biggestWin.username, "cem");
assert.strictEqual(gs.find((g) => g.game === "slot").houseEdge, 100);
assert.deepStrictEqual(gs.map((g) => g.game), ["blackjack", "slot", "coinflip"]);

/* ---- fair play ---- */
const fp = I.fairPlay(rows.filter((r) => r.user_id === A), 0);
assert.strictEqual(fp.band, "few");
assert.strictEqual(fp.status, "normal");
assert.strictEqual(fp.avgBet, 125);
assert.strictEqual(I.fairPlay(rows.filter((r) => r.user_id === A), 3).status, "review", "3 open hands = review");
assert.strictEqual(I.winBand(70, 50), "high");
assert.strictEqual(I.winBand(46, 50), "normal");

/* ---- anomalies ---- */
const lucky = Array.from({ length: 16 }, (_, i) => hand(A, "win", 100, 200, 100 - i));
const many = [...Array.from({ length: 30 }, (_, i) => hand(B, "win", 10, 20, 500 - i)), ...Array.from({ length: 12 }, (_, i) => hand(B, i % 2 ? "loss" : "win", 10, i % 2 ? 0 : 20, 400 - i))];
const transfers = [
  { from_user_id: "f1", to_user_id: C, amount: 3000, created_at: at(60) },
  { from_user_id: "f2", to_user_id: C, amount: 3000, created_at: at(50) },
  { from_user_id: "f3", to_user_id: C, amount: 3000, created_at: at(40) },
  { from_user_id: "f4", to_user_id: C, amount: 9000, created_at: at(30) },
  { from_user_id: "f5", to_user_id: C, amount: 9000, created_at: at(20) },
  { from_user_id: "old", to_user_id: B, amount: 1, created_at: new Date(NOW - 9 * DAY).toISOString() },
];
const jump = [
  { user_id: B, kind: "game", delta: 100, balance_after: 1200, created_at: at(90) },
  { user_id: B, kind: "transfer_in", delta: 60000, balance_after: 61200, created_at: at(60) },
];
const an = I.detectAnomalies({ hands: [...lucky, ...many], transfers, ledger: jump, now: NOW });
const byType = (t, u) => an.find((x) => x.type === t && x.userId === u);
assert.ok(byType("streak", A) && byType("streak", A).severity === "high" && byType("streak", A).vars.count === 16, "16 wins in a row = high");
assert.ok(byType("winRate", B) && byType("winRate", B).vars.hands === 42, "B wins 36 of 42 hands");
assert.strictEqual(byType("winRate", B).severity, "high");
assert.ok(byType("multiTransfer", C) && byType("multiTransfer", C).severity === "high" && byType("multiTransfer", C).vars.senders === 5 && byType("multiTransfer", C).vars.amount === 27000);
assert.ok(byType("farming", C) && byType("farming", C).vars.accounts === 5, "senders who never play");
assert.ok(byType("jump", B) && byType("jump", B).vars.from === 1100 && byType("jump", B).vars.to === 61200);
assert.ok(!an.some((x) => x.userId === B && x.type === "multiTransfer"), "transfers older than 7 days ignored");
const risk = I.riskByUser(an);
assert.strictEqual(risk.get(A), "high");
assert.strictEqual(risk.get(C), "high");
assert.deepStrictEqual(I.detectAnomalies({ hands: rows, now: NOW }), [], "normal play has no anomaly");

/* ---- series ---- */
const keys = I.dayKeys(3, NOW);
assert.deepStrictEqual(keys, ["2026-11-12", "2026-11-13", "2026-11-14"]);
const series = I.balanceSeries({
  days: 3,
  now: NOW,
  current: 12450,
  entries: [
    { at: at(60), delta: 2000, kind: "game" },
    { at: new Date(NOW - DAY).toISOString(), delta: 5000, kind: "admin" },
  ],
  hands: [hand(A, "win", 1, 2, 60)],
});
assert.deepStrictEqual(series.map((d) => d.balance), [5450, 10450, 12450]);
assert.strictEqual(series[1].admin, 5000);
assert.strictEqual(series[2].hands, 1);
const circ = I.circulationSeries({ days: 2, now: NOW, total: 10000, hands: [hand(A, "loss", 500, 0, 30)], wallets: [{ created_at: at(10) }], ledger: [{ kind: "daily", delta: 250, created_at: at(5) }, { kind: "admin", delta: -100, created_at: at(4) }] });
assert.deepStrictEqual(circ.map((d) => d.credits), [10000 - (-500 + 1000 + 250 - 100), 10000]);
assert.strictEqual(circ[1].admin, -100);
assert.strictEqual(circ[1].hands, 1);

/* ---- ledger fallback from hands ---- */
const synth = I.ledgerFromHands([hand(A, "loss", 1000, 0, 10), hand(A, "win", 2000, 4000, 5)], 12450);
assert.deepStrictEqual(synth.map((e) => [e.delta, e.balanceAfter]), [[2000, 12450], [-1000, 10450]]);
assert.ok(synth.every((e) => e.approximate && e.kind === "game"));

/* ---- bonus streak (UTC days) ---- */
assert.strictEqual(I.bonusStreak([NOW, NOW - DAY, NOW - 2 * DAY, NOW - 4 * DAY], NOW), 3);
assert.strictEqual(I.bonusStreak([NOW - DAY], NOW), 1, "yesterday keeps the streak");
assert.strictEqual(I.bonusStreak([NOW - 2 * DAY], NOW), 0);

/* ---- CSV ---- */
const csv = I.toCsv([{ a: "=SUM(A1)", b: 'x"y', c: -5 }], [{ key: "a", label: "a" }, { key: "b", label: "b" }, { key: "c", label: "c" }]);
assert.strictEqual(csv, 'a,b,c\n\'=SUM(A1),"x""y",-5');

/* ---- limits: what applies ---- */
const exp = new Date(NOW + 10 * DAY).toISOString();
const row = { max_bet: 5000, daily_loss_cap: 20000, daily_hand_cap: 200, transfers_enabled: false, frozen_until: null, freeze_indefinite: false, expires_at: exp, auto_lift: true, leaderboard_hidden: true };
const lim = L.activeLimits(row, NOW);
assert.deepStrictEqual([lim.maxBet, lim.dailyLossCap, lim.dailyHandCap, lim.transfersEnabled, lim.frozen, lim.limited, lim.leaderboardHidden], [5000, 20000, 200, false, false, true, true]);
const expired = L.activeLimits({ ...row, expires_at: new Date(NOW - 1000).toISOString() }, NOW);
assert.deepStrictEqual([expired.maxBet, expired.transfersEnabled, expired.limited, expired.expired], [null, true, false, true], "auto lift after the date");
assert.strictEqual(L.activeLimits({ ...row, expires_at: new Date(NOW - 1000).toISOString(), auto_lift: false }, NOW).maxBet, 5000, "no auto lift keeps them");
const frozen = L.activeLimits({ frozen_until: new Date(NOW + DAY).toISOString() }, NOW);
assert.ok(frozen.frozen && !frozen.indefinite && frozen.frozenUntil);
assert.ok(L.activeLimits({ freeze_indefinite: true }, NOW).indefinite);
assert.ok(!L.activeLimits({ frozen_until: new Date(NOW - 1).toISOString() }, NOW).frozen, "freeze over");
assert.strictEqual(L.activeLimits(null).limited, false);

/* ---- limits: play / transfer decisions + English text ---- */
assert.strictEqual(L.playBlock(lim, 5000, { hands: 10, loss: 0 }), null);
let r = L.playBlock(lim, 6000, { hands: 10, loss: 0 });
assert.strictEqual(r.vars.main.key, "gamesAdmin.bot.maxBet");
assert.ok(L.englishOf(r).startsWith("Your limit is 5,000 credits per hand. Your limits apply until"), L.englishOf(r));
r = L.playBlock(lim, 100, { hands: 200, loss: 0 });
assert.strictEqual(r.vars.main.key, "gamesAdmin.bot.dailyHands");
r = L.playBlock(lim, 100, { hands: 1, loss: 20000 });
assert.strictEqual(r.vars.main.key, "gamesAdmin.bot.dailyLoss");
assert.ok(L.englishOf(r).startsWith("You reached today's loss limit (20,000 credits)."));
r = L.playBlock(lim, 3000, { hands: 1, loss: 18000 });
assert.strictEqual(r.vars.main.key, "gamesAdmin.bot.dailyLossLeft");
assert.strictEqual(r.vars.main.vars.left, 2000);
r = L.playBlock(L.activeLimits({ freeze_indefinite: true }), 10);
assert.strictEqual(L.englishOf(r), "Your games are paused. Your credits are kept.");
assert.strictEqual(L.transferBlock(lim).vars.main.key, "gamesAdmin.bot.transfersOff");
assert.strictEqual(L.transferBlock(L.activeLimits({})), null);
assert.strictEqual(L.previewNotice(lim).vars.main.key, "gamesAdmin.bot.dailyLoss", "preview shows the loss cap first");
assert.strictEqual(L.previewNotice(L.activeLimits({})), null);

/* ---- limits: admin form ---- */
let n = L.normalizeInput({ maxBet: "5000", dailyLossCap: 0, dailyHandCap: "", transfersEnabled: false, freeze: "24h", reason: "Kullanıcı istedi" }, null, { now: NOW });
assert.deepStrictEqual(n.errors, []);
assert.strictEqual(n.row.max_bet, 5000);
assert.strictEqual(n.row.daily_loss_cap, null, "0 = off");
assert.strictEqual(n.row.frozen_until, new Date(NOW + 24 * 3600000).toISOString());
assert.strictEqual(n.row.transfers_enabled, false);
n = L.normalizeInput({ maxBet: 30000, reason: "x" }, null, { now: NOW });
assert.deepStrictEqual(n.errors.sort(), ["maxBet", "reason"]);
n = L.normalizeInput({ freeze: "keep", reason: "keep freeze", expiresAt: new Date(NOW - DAY).toISOString() }, { frozen_until: "2030-01-01T00:00:00.000Z" }, { now: NOW });
assert.deepStrictEqual(n.errors, ["expiresAtPast"]);
assert.strictEqual(n.row.frozen_until, "2030-01-01T00:00:00.000Z", "keep leaves the running freeze");
n = L.normalizeInput({ freeze: "forever", reason: "süresiz dondur" }, null, { now: NOW });
assert.ok(n.row.freeze_indefinite && n.row.frozen_until === null);

/* ---- ledger rows ---- */
assert.strictEqual(ledger.toRow({ userId: "nope", kind: "game", delta: 1 }), null, "not a uuid");
assert.strictEqual(ledger.toRow({ userId: A, kind: "weird", delta: 1 }), null);
const lr = ledger.toRow({ userId: A, kind: "admin", delta: 5000.4, balanceAfter: 12450, actor: { id: B, username: "demir" }, reason: "x".repeat(600), context: { context_kind: "group", context_id: "g1" } });
assert.strictEqual(lr.delta, 5000);
assert.strictEqual(lr.reason.length, 500);
assert.strictEqual(lr.actor_username, "demir");
assert.strictEqual(lr.context_kind, "group");
assert.deepStrictEqual(ledger.contextOf({ kind: "dm", dmUserIds: [A, B] }, A), { context_kind: "dm", context_id: B });
assert.deepStrictEqual(ledger.contextOf({ kind: "channel", channelId: "c1" }, A), { context_kind: "channel", context_id: "c1" });
assert.deepStrictEqual(ledger.contextOf({ kind: "group", groupId: "g9", roomId: "g9" }, A), { context_kind: "group", context_id: "g9" });

console.log("casinoInsights selftest ok");
