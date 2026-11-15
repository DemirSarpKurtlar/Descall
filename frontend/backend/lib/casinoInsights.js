"use strict";

/**
 * Oyunlar / Kredi (admin, section casino): pure math over game rows. No I/O.
 * Game credits are points only (never money, never DesCoin, never convertible).
 *
 * Inputs are plain rows:
 *   hand     { id, user_id, game_type, bet_amount, win_amount, result, played_at }
 *   ledger   { user_id, kind, delta, balance_after, created_at, counterparty_id, ... }
 *   transfer { from_user_id, to_user_id, amount, created_at }
 *
 * Used by lib/casinoAdminStore.js (routes/adminCasino.js) and the game limits.
 */

const DAY_MS = 86400000;
const ISTANBUL_OFFSET_MS = 3 * 3600000; // Europe/Istanbul is UTC+3 all year since 2016.
const GAME_TYPES = Object.freeze(["blackjack", "slot", "coinflip"]);

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function ms(v) {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

function isWin(result) {
  return result === "win" || result === "blackjack";
}

function isPush(result) {
  return result === "push";
}

/** Net change of one hand: what came back minus the stake. */
function handDelta(row) {
  return num(row.win_amount) - num(row.bet_amount);
}

/** Start of the Istanbul calendar day that contains `now` (games reset at 00:00 there). */
function istanbulDayStart(now = Date.now()) {
  const t = ms(now) || Date.now();
  const shifted = t + ISTANBUL_OFFSET_MS;
  return Math.floor(shifted / DAY_MS) * DAY_MS - ISTANBUL_OFFSET_MS;
}

/** "YYYY-MM-DD" of the Istanbul day of a timestamp. */
function istanbulDayKey(at) {
  const d = new Date(ms(at) + ISTANBUL_OFFSET_MS);
  return d.toISOString().slice(0, 10);
}

/** Per-user hand summary: hands, wins, pushes, losses, net, first / last hand. */
function summarizeHands(rows) {
  const out = new Map();
  for (const r of rows || []) {
    const id = String(r.user_id || "");
    if (!id) continue;
    let s = out.get(id);
    if (!s) {
      s = { hands: 0, wins: 0, pushes: 0, losses: 0, net: 0, staked: 0, firstAt: null, lastAt: null };
      out.set(id, s);
    }
    s.hands += 1;
    if (isWin(r.result)) s.wins += 1;
    else if (isPush(r.result)) s.pushes += 1;
    else s.losses += 1;
    s.net += handDelta(r);
    s.staked += num(r.bet_amount);
    const at = r.played_at || null;
    if (at && (!s.firstAt || ms(at) < ms(s.firstAt))) s.firstAt = at;
    if (at && (!s.lastAt || ms(at) > ms(s.lastAt))) s.lastAt = at;
  }
  return out;
}

/** Win share in percent (one decimal), null without hands. */
function winRate(summary) {
  if (!summary || !summary.hands) return null;
  return Math.round((summary.wins / summary.hands) * 1000) / 10;
}

/** Longest run of winning hands in time order. */
function longestWinStreak(rows) {
  const sorted = [...(rows || [])].sort((a, b) => ms(a.played_at) - ms(b.played_at));
  let best = 0;
  let run = 0;
  for (const r of sorted) {
    if (isWin(r.result)) {
      run += 1;
      if (run > best) best = run;
    } else if (!isPush(r.result)) {
      run = 0;
    }
  }
  return best;
}

/**
 * Per-game statistics over a window: hands, player win / push / loss share,
 * observed dealer edge ((staked - paid back) / staked), average stake and the
 * biggest single win with who won it.
 */
function gameStats(rows, nameById = new Map()) {
  const by = new Map(GAME_TYPES.map((g) => [g, []]));
  for (const r of rows || []) {
    const g = GAME_TYPES.includes(r.game_type) ? r.game_type : "blackjack";
    by.get(g).push(r);
  }
  return GAME_TYPES.map((game) => {
    const list = by.get(game);
    let wins = 0;
    let pushes = 0;
    let staked = 0;
    let paid = 0;
    let best = null;
    for (const r of list) {
      if (isWin(r.result)) wins += 1;
      else if (isPush(r.result)) pushes += 1;
      staked += num(r.bet_amount);
      paid += num(r.win_amount);
      const d = handDelta(r);
      if (d > 0 && (!best || d > best.amount)) best = { amount: d, userId: r.user_id, at: r.played_at };
    }
    const hands = list.length;
    const pct = (n) => (hands ? Math.round((n / hands) * 1000) / 10 : 0);
    const losses = hands - wins - pushes;
    return {
      game,
      hands,
      winPct: pct(wins),
      pushPct: pct(pushes),
      lossPct: hands ? Math.round((100 - pct(wins) - pct(pushes)) * 10) / 10 : 0,
      losses,
      houseEdge: staked > 0 ? Math.round(((staked - paid) / staked) * 1000) / 10 : null,
      avgBet: hands ? Math.round(staked / hands) : 0,
      staked,
      biggestWin: best
        ? { amount: best.amount, userId: best.userId, username: nameById.get(String(best.userId)) || null, at: best.at }
        : null,
    };
  });
}

/** Win rate band for one player: a long run far from the house odds is worth a look. */
function winBand(rate, hands) {
  if (rate == null || hands < 30) return "few";
  if (rate >= 65) return "high";
  if (rate <= 20) return "low";
  return "normal";
}

/**
 * Fair play summary of one player's hands (newest window): win rate + band,
 * longest win streak, average stake, hands left open (escrowed, never settled).
 */
function fairPlay(rows, openHands = 0) {
  const s = summarizeHands(rows).values().next().value || { hands: 0, wins: 0, staked: 0 };
  const rate = winRate(s);
  const streak = longestWinStreak(rows);
  const band = winBand(rate, s.hands);
  const status = band === "high" || streak >= 10 || openHands > 2 ? "review" : "normal";
  return {
    hands: s.hands,
    winRate: rate,
    band,
    longestStreak: streak,
    avgBet: s.hands ? Math.round(s.staked / s.hands) : 0,
    openHands,
    status,
  };
}

const SEVERITY_ORDER = { high: 3, medium: 2, low: 1 };

/**
 * Anomaly detection (all explainable, every hit carries its numbers):
 *  - streak        10+ winning hands in a row (15+ = high)
 *  - winRate       40+ hands with a win share of 65 %+ (75 %+ = high)
 *  - multiTransfer one account receives !pay from 3+ different accounts within 7 days
 *                  (5+ senders or 20,000+ credits = high)
 *  - farming       2+ of those senders barely play (< 5 hands) and only pass credits on
 *  - jump          balance grows 10x and by 20,000+ within an hour (from the ledger)
 * Returns the newest-first list, one entry per user and type.
 */
function detectAnomalies({ hands = [], transfers = [], ledger = [], now = Date.now() } = {}) {
  const out = [];
  const nowMs = ms(now) || Date.now();
  const byUser = new Map();
  for (const r of hands) {
    const id = String(r.user_id || "");
    if (!id) continue;
    if (!byUser.has(id)) byUser.set(id, []);
    byUser.get(id).push(r);
  }

  // Streaks: look at the last 7 days of hands.
  for (const [userId, list] of byUser) {
    const recent = list.filter((r) => nowMs - ms(r.played_at) <= 7 * DAY_MS);
    const streak = longestWinStreak(recent);
    if (streak >= 10) {
      const lastAt = recent.reduce((m, r) => Math.max(m, ms(r.played_at)), 0);
      out.push({ type: "streak", severity: streak >= 15 ? "high" : "medium", userId, at: new Date(lastAt).toISOString(), vars: { count: streak } });
    }
    const s = summarizeHands(list).get(userId);
    const rate = winRate(s);
    if (s && s.hands >= 40 && rate >= 65) {
      out.push({ type: "winRate", severity: rate >= 75 ? "high" : "medium", userId, at: s.lastAt, vars: { rate, hands: s.hands } });
    }
  }

  // Transfers within 7 days, grouped by recipient.
  const recentTransfers = transfers.filter((t) => nowMs - ms(t.created_at) <= 7 * DAY_MS);
  const byRecipient = new Map();
  for (const t of recentTransfers) {
    const to = String(t.to_user_id || "");
    if (!to) continue;
    if (!byRecipient.has(to)) byRecipient.set(to, []);
    byRecipient.get(to).push(t);
  }
  const handsOf = (id) => (byUser.get(id) || []).length;
  for (const [to, list] of byRecipient) {
    const senders = [...new Set(list.map((t) => String(t.from_user_id)))];
    const total = list.reduce((sum, t) => sum + num(t.amount), 0);
    const lastAt = list.reduce((m, t) => Math.max(m, ms(t.created_at)), 0);
    if (senders.length >= 3) {
      out.push({
        type: "multiTransfer",
        severity: senders.length >= 5 || total >= 20000 ? "high" : "medium",
        userId: to,
        at: new Date(lastAt).toISOString(),
        vars: { senders: senders.length, amount: total },
        related: senders,
      });
    }
    const farms = senders.filter((id) => handsOf(id) < 5);
    if (farms.length >= 2) {
      out.push({
        type: "farming",
        severity: farms.length >= 4 ? "high" : "medium",
        userId: to,
        at: new Date(lastAt).toISOString(),
        vars: { accounts: farms.length, amount: list.filter((t) => farms.includes(String(t.from_user_id))).reduce((s2, t) => s2 + num(t.amount), 0) },
        related: farms,
      });
    }
  }

  // Sudden balance jumps from the ledger (balance_after over one hour).
  const ledgerByUser = new Map();
  for (const e of ledger) {
    if (e.balance_after == null) continue;
    const id = String(e.user_id || "");
    if (!ledgerByUser.has(id)) ledgerByUser.set(id, []);
    ledgerByUser.get(id).push(e);
  }
  for (const [userId, list] of ledgerByUser) {
    const sorted = list.filter((e) => nowMs - ms(e.created_at) <= 7 * DAY_MS).sort((a, b) => ms(a.created_at) - ms(b.created_at));
    let hit = null;
    for (let i = 0; i < sorted.length && !hit; i += 1) {
      const start = sorted[i];
      const before = num(start.balance_after) - num(start.delta);
      for (let j = i; j < sorted.length; j += 1) {
        if (ms(sorted[j].created_at) - ms(start.created_at) > 3600000) break;
        const after = num(sorted[j].balance_after);
        if (before > 0 && after >= before * 10 && after - before >= 20000) {
          hit = { from: before, to: after, at: sorted[j].created_at, minutes: Math.max(1, Math.round((ms(sorted[j].created_at) - ms(start.created_at)) / 60000)) };
          break;
        }
      }
    }
    if (hit) out.push({ type: "jump", severity: "low", userId, at: hit.at, vars: hit });
  }

  return out.sort((a, b) => ms(b.at) - ms(a.at) || SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);
}

/** Highest anomaly severity per user ("high" | "medium" | "low"). */
function riskByUser(anomalies) {
  const out = new Map();
  for (const a of anomalies || []) {
    const cur = out.get(a.userId);
    if (!cur || SEVERITY_ORDER[a.severity] > SEVERITY_ORDER[cur]) out.set(a.userId, a.severity);
  }
  return out;
}

/** Day keys (Istanbul) for the last `days` days, oldest first, ending today. */
function dayKeys(days, now = Date.now()) {
  const start = istanbulDayStart(now);
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) out.push(istanbulDayKey(start - i * DAY_MS + 3600000));
  return out;
}

/**
 * One player's balance per day (end of day), walking back from the current
 * balance over the known changes (ledger entries, or hand deltas before the
 * ledger existed). `entries` = [{ at, delta, kind }].
 */
function balanceSeries({ days = 30, now = Date.now(), current = 0, entries = [], hands = [] }) {
  const keys = dayKeys(days, now);
  const deltaByDay = new Map(keys.map((k) => [k, 0]));
  const handsByDay = new Map(keys.map((k) => [k, 0]));
  const adminByDay = new Map(keys.map((k) => [k, 0]));
  for (const e of entries) {
    const k = istanbulDayKey(e.at);
    if (deltaByDay.has(k)) deltaByDay.set(k, deltaByDay.get(k) + num(e.delta));
    if (e.kind === "admin" || e.kind === "reset") {
      if (adminByDay.has(k)) adminByDay.set(k, adminByDay.get(k) + num(e.delta));
    }
  }
  for (const h of hands) {
    const k = istanbulDayKey(h.played_at);
    if (handsByDay.has(k)) handsByDay.set(k, handsByDay.get(k) + 1);
  }
  const out = [];
  let balance = num(current);
  for (let i = keys.length - 1; i >= 0; i -= 1) {
    const k = keys[i];
    out.unshift({ day: k, balance: Math.max(0, balance), hands: handsByDay.get(k), admin: adminByDay.get(k) });
    balance -= deltaByDay.get(k);
  }
  return out;
}

/**
 * Credits in circulation per day (end of day) for the whole system, walking
 * back from today's total over hand results, new wallets (starting credits) and
 * ledger bonus / admin / reset entries. Hands per day for the bars, admin
 * adjustments for the markers.
 */
function circulationSeries({ days = 30, now = Date.now(), total = 0, hands = [], wallets = [], ledger = [], startingCredits = 1000 }) {
  const keys = dayKeys(days, now);
  const flow = new Map(keys.map((k) => [k, 0]));
  const handCount = new Map(keys.map((k) => [k, 0]));
  const admin = new Map(keys.map((k) => [k, 0]));
  const add = (map, k, v) => {
    if (map.has(k)) map.set(k, map.get(k) + v);
  };
  for (const h of hands) {
    const k = istanbulDayKey(h.played_at);
    add(flow, k, handDelta(h));
    add(handCount, k, 1);
  }
  for (const w of wallets) {
    if (w.created_at) add(flow, istanbulDayKey(w.created_at), startingCredits);
  }
  for (const e of ledger) {
    if (e.kind === "daily" || e.kind === "admin" || e.kind === "reset") add(flow, istanbulDayKey(e.created_at), num(e.delta));
    if (e.kind === "admin" || e.kind === "reset") add(admin, istanbulDayKey(e.created_at), num(e.delta));
  }
  const out = [];
  let running = num(total);
  for (let i = keys.length - 1; i >= 0; i -= 1) {
    const k = keys[i];
    out.unshift({ day: k, credits: Math.max(0, running), hands: handCount.get(k), admin: admin.get(k) });
    running -= flow.get(k);
  }
  return out;
}

/**
 * Ledger-shaped entries from game_history alone (before credit_ledger existed),
 * newest first, with the balance after each hand walked back from the current
 * balance. Marked `approximate`: bonuses and transfers are not in game_history.
 */
function ledgerFromHands(rows, currentBalance) {
  const sorted = [...(rows || [])].sort((a, b) => ms(b.played_at) - ms(a.played_at));
  let balance = num(currentBalance);
  return sorted.map((r) => {
    const delta = handDelta(r);
    const entry = {
      id: `h-${r.id}`,
      at: r.played_at,
      kind: "game",
      gameType: r.game_type || "blackjack",
      result: r.result,
      bet: num(r.bet_amount),
      delta,
      balanceAfter: Math.max(0, balance),
      refId: r.id,
      approximate: true,
    };
    balance -= delta;
    return entry;
  });
}

/** Consecutive UTC days with a daily bonus claim, ending today or yesterday. */
function bonusStreak(claimTimes, now = Date.now()) {
  const days = new Set((claimTimes || []).map((t) => Math.floor(ms(t) / DAY_MS)));
  let day = Math.floor((ms(now) || Date.now()) / DAY_MS);
  if (!days.has(day)) day -= 1;
  let streak = 0;
  while (days.has(day)) {
    streak += 1;
    day -= 1;
  }
  return streak;
}

function csvCell(v) {
  if (v == null) return "";
  const s = String(v);
  // Spreadsheet formula injection guard.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV text (header row + rows) from column definitions [{ key, label }]. */
function toCsv(rows, columns) {
  const head = columns.map((c) => csvCell(c.label)).join(",");
  const body = (rows || []).map((r) => columns.map((c) => csvCell(typeof c.get === "function" ? c.get(r) : r[c.key])).join(","));
  return [head, ...body].join("\n");
}

module.exports = {
  DAY_MS,
  GAME_TYPES,
  isWin,
  isPush,
  handDelta,
  istanbulDayStart,
  istanbulDayKey,
  summarizeHands,
  winRate,
  winBand,
  longestWinStreak,
  gameStats,
  fairPlay,
  detectAnomalies,
  riskByUser,
  dayKeys,
  balanceSeries,
  circulationSeries,
  ledgerFromHands,
  bonusStreak,
  toCsv,
};
