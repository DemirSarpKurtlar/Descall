"use strict";

/**
 * Oyunlar / Kredi (admin, section casino): data access for routes/adminCasino.js.
 * Reads user_credits, game_history, credit_ledger, credit_transfers and
 * user_game_limits; the math lives in lib/casinoInsights.js (pure, selftested).
 * Every read degrades: a missing new table = fall back to game_history.
 */

const insights = require("./casinoInsights");
const casinoLedger = require("./casinoLedger");
const gameLimits = require("./gameLimits");

const PAGE = 1000;
const MAX_HAND_ROWS = 100000;
const SNAPSHOT_MS = 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HAND_COLS = "id, user_id, game_type, bet_amount, win_amount, result, played_at";
const USER_COLS = "id, username, display_name, avatar_url, birth_date, created_at, is_admin, is_banned";

let clientOverride = null;
let snap = null;
let snapAt = 0;
let snapPending = null;

function db() {
  return clientOverride || require("../db/supabase");
}

function isUuid(v) {
  return UUID.test(String(v || ""));
}

async function pages(build, max = MAX_HAND_ROWS) {
  const out = [];
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data || [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function usersByIds(ids) {
  const list = [...new Set((ids || []).map(String).filter(isUuid))];
  const map = new Map();
  for (let i = 0; i < list.length; i += 200) {
    const { data, error } = await db().from("users").select(USER_COLS).in("id", list.slice(i, i + 200));
    if (error) throw error;
    for (const u of data || []) map.set(String(u.id), u);
  }
  return map;
}

function ageVerified(birthDate, now = Date.now()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birthDate || ""));
  if (!m) return false;
  const d = new Date(now);
  let age = d.getUTCFullYear() - Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  if (d.getUTCMonth() + 1 < mo || (d.getUTCMonth() + 1 === mo && d.getUTCDate() < day)) age -= 1;
  return age >= 18;
}

function publicUser(u, id) {
  if (!u) return { id, username: null, displayName: null, avatarUrl: null };
  return {
    id: String(u.id),
    username: u.username || null,
    displayName: u.display_name || u.username || null,
    avatarUrl: u.avatar_url || null,
    isAdmin: Boolean(u.is_admin),
    isBanned: Boolean(u.is_banned),
  };
}

/**
 * Cached view of every wallet, the last hands, transfers, ledger and limits
 * (one minute; writes call invalidate()). Used by the player list, the
 * statistics page, anomalies and ranks.
 */
async function snapshot({ fresh = false } = {}) {
  if (!fresh && snap && Date.now() - snapAt < SNAPSHOT_MS) return snap;
  if (snapPending) return snapPending;
  snapPending = (async () => {
    const now = Date.now();
    const since90 = new Date(now - 90 * insights.DAY_MS).toISOString();
    const since30 = new Date(now - 30 * insights.DAY_MS).toISOString();
    const [wallets, hands, ledger, transfers, limits] = await Promise.all([
      pages(() => db().from("user_credits").select("user_id, credits, total_won, total_lost, games_played, last_daily_claim, updated_at, created_at").order("credits", { ascending: false })),
      pages(() => db().from("game_history").select(HAND_COLS).order("played_at", { ascending: false })),
      casinoLedger.readTable("credit_ledger", (q) => q.select("user_id, kind, game_type, result, delta, balance_after, created_at, counterparty_id, actor_username, reason").gte("created_at", since90).order("created_at", { ascending: false }).limit(50000)),
      casinoLedger.readTable("credit_transfers", (q) => q.select("from_user_id, to_user_id, amount, created_at").gte("created_at", since30).order("created_at", { ascending: false }).limit(20000)),
      gameLimits.listRows().catch(() => ({ ready: false, rows: [] })),
    ]);
    const users = await usersByIds([...wallets.map((w) => w.user_id), ...transfers.rows.flatMap((t) => [t.from_user_id, t.to_user_id])]);
    const summary = insights.summarizeHands(hands);
    const recent = hands.filter((h) => new Date(h.played_at).getTime() >= now - 30 * insights.DAY_MS);
    const anomalies = insights.detectAnomalies({ hands: recent, transfers: transfers.rows, ledger: ledger.rows, now });
    const risk = insights.riskByUser(anomalies);
    const limitsById = new Map(limits.rows.map((r) => [String(r.user_id), r]));
    const value = {
      at: new Date(now).toISOString(),
      wallets,
      hands,
      ledger: ledger.rows,
      transfers: transfers.rows,
      ready: { ledger: ledger.ready, transfers: transfers.ready, limits: limits.ready },
      users,
      summary,
      anomalies,
      risk,
      limitsById,
      since30,
    };
    snap = value;
    snapAt = Date.now();
    return value;
  })();
  try {
    return await snapPending;
  } finally {
    snapPending = null;
  }
}

function invalidateLocal() {
  snapAt = 0;
}
// Hybrid server: clearing this cache also clears it on the other nodes (no-op on a single node).
const invalidate = require("./cluster").linkInvalidate("casinoAdmin", invalidateLocal);

function flagsFor(s, userId, now = Date.now()) {
  const row = s.limitsById.get(String(userId)) || null;
  const lim = gameLimits.activeLimits(row, now);
  return {
    risk: s.risk.get(String(userId)) || null,
    limited: lim.limited,
    frozen: lim.frozen,
    hidden: lim.leaderboardHidden,
  };
}

function foldTr(v) {
  return String(v || "")
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i");
}

const SORTS = Object.freeze(["balance", "hands", "winrate", "recent"]);
const FILTERS = Object.freeze(["all", "risky", "limited", "frozen"]);

/** Player list rows (search, filter, sort, page) + filter counts. */
async function listPlayers({ q = "", filter = "all", sort = "balance", limit = 100, offset = 0 } = {}) {
  const s = await snapshot();
  const now = Date.now();
  const rows = s.wallets.map((w) => {
    const id = String(w.user_id);
    const u = s.users.get(id);
    const sum = s.summary.get(id);
    return {
      ...publicUser(u, id),
      credits: Number(w.credits) || 0,
      hands: Math.max(Number(w.games_played) || 0, sum?.hands || 0),
      winRate: insights.winRate(sum),
      lastPlayedAt: sum?.lastAt || null,
      flags: flagsFor(s, id, now),
    };
  });
  const counts = {
    all: rows.length,
    risky: rows.filter((r) => r.flags.risk).length,
    limited: rows.filter((r) => r.flags.limited).length,
    frozen: rows.filter((r) => r.flags.frozen).length,
  };
  const f = FILTERS.includes(filter) ? filter : "all";
  let list = rows;
  if (f === "risky") list = list.filter((r) => r.flags.risk);
  if (f === "limited") list = list.filter((r) => r.flags.limited);
  if (f === "frozen") list = list.filter((r) => r.flags.frozen);
  const needle = foldTr(String(q || "").replace(/^@/, "").trim());
  if (needle) {
    list = list.filter((r) => foldTr(r.username).includes(needle) || foldTr(r.displayName).includes(needle) || r.id === needle);
  }
  const by = SORTS.includes(sort) ? sort : "balance";
  const cmp = {
    balance: (a, b) => b.credits - a.credits,
    hands: (a, b) => b.hands - a.hands || b.credits - a.credits,
    winrate: (a, b) => (b.winRate ?? -1) - (a.winRate ?? -1) || b.hands - a.hands,
    recent: (a, b) => new Date(b.lastPlayedAt || 0) - new Date(a.lastPlayedAt || 0),
  }[by];
  list = [...list].sort(cmp);
  const lim = Math.max(1, Math.min(5000, Number(limit) || 100));
  const off = Math.max(0, Number(offset) || 0);
  return { players: list.slice(off, off + lim), total: list.length, counts, ready: s.ready, at: s.at };
}

async function contextLabels(entries) {
  const groups = new Set();
  const channels = new Set();
  const people = new Set();
  for (const e of entries) {
    if (!e.context_id) continue;
    if (e.context_kind === "group" && isUuid(e.context_id)) groups.add(e.context_id);
    if (e.context_kind === "channel" && isUuid(e.context_id)) channels.add(e.context_id);
    if (e.context_kind === "dm" && isUuid(e.context_id)) people.add(e.context_id);
  }
  const out = new Map();
  const soft = async (fn) => {
    try {
      const { data, error } = await fn();
      return error ? [] : data || [];
    } catch {
      return [];
    }
  };
  const [g, c] = await Promise.all([
    groups.size ? soft(() => db().from("groups").select("id, name").in("id", [...groups])) : [],
    channels.size ? soft(() => db().from("server_channels").select("id, server_id, name").in("id", [...channels])) : [],
  ]);
  for (const row of g) out.set(`group:${row.id}`, row.name || null);
  for (const row of c) out.set(`channel:${row.id}`, row.name || null);
  if (people.size) {
    const users = await usersByIds([...people]).catch(() => new Map());
    for (const [id, u] of users) out.set(`dm:${id}`, u.username || null);
  }
  return out;
}

function contextOf(entry, labels) {
  if (!entry.context_kind) return null;
  return { kind: entry.context_kind, id: entry.context_id || null, label: labels.get(`${entry.context_kind}:${entry.context_id}`) || null };
}

const KIND_FILTER = {
  all: null,
  game: ["game"],
  bonus: ["daily"],
  transfer: ["transfer_in", "transfer_out"],
  admin: ["admin", "reset"],
};

function mapLedgerRow(r, people, labels) {
  const cp = r.counterparty_id ? people.get(String(r.counterparty_id)) : null;
  return {
    id: r.id,
    at: r.created_at,
    kind: r.kind,
    gameType: r.game_type || null,
    result: r.result || null,
    bet: r.bet ?? null,
    delta: Number(r.delta) || 0,
    balanceAfter: r.balance_after ?? null,
    refId: r.ref_id || null,
    counterparty: cp ? { id: String(cp.id), username: cp.username } : null,
    actor: r.actor_username || null,
    reason: r.reason || null,
    category: r.category || null,
    context: contextOf(r, labels),
  };
}

/**
 * One player's credit ledger, newest first. kind = all | game | bonus | transfer | admin.
 * Before credit_ledger exists (or older than its first row) hands from
 * game_history fill in, with the running balance walked back (approximate).
 */
async function playerLedger(userId, { kind = "all", limit = 50, before = null, balance = null } = {}) {
  const lim = Math.max(1, Math.min(2000, Number(limit) || 50));
  const kinds = KIND_FILTER[kind] === undefined ? null : KIND_FILTER[kind];
  const res = await casinoLedger.readTable("credit_ledger", (q) => {
    let query = q.select("*").eq("user_id", userId);
    if (kinds) query = query.in("kind", kinds);
    if (before) query = query.lt("created_at", before);
    return query.order("created_at", { ascending: false }).limit(lim + 1);
  });
  const rows = res.rows.slice(0, lim);
  let hasMore = res.rows.length > lim;
  const people = await usersByIds(rows.map((r) => r.counterparty_id).filter(Boolean)).catch(() => new Map());
  const labels = await contextLabels(rows);
  let entries = rows.map((r) => mapLedgerRow(r, people, labels));
  let source = res.ready ? "ledger" : "history";

  if ((!kinds || kinds.includes("game")) && !hasMore && entries.length < lim) {
    // Hands older than the ledger's first row (or every hand without a ledger),
    // with the running balance walked back from the last known balance.
    const oldest = entries[entries.length - 1];
    let fromBalance = Number.isFinite(Number(balance)) && balance !== null && balance !== "" ? Number(balance) : null;
    if (oldest) fromBalance = oldest.balanceAfter != null ? (Number(oldest.balanceAfter) || 0) - (Number(oldest.delta) || 0) : fromBalance;
    if (fromBalance == null) {
      const { data: wallet } = await db().from("user_credits").select("credits").eq("user_id", userId).maybeSingle();
      fromBalance = Number(wallet?.credits) || 0;
    }
    const cutoff = oldest ? oldest.at : before;
    let q = db().from("game_history").select(HAND_COLS).eq("user_id", userId);
    if (cutoff) q = q.lt("played_at", cutoff);
    const need = lim - entries.length;
    const { data, error } = await q.order("played_at", { ascending: false }).limit(need + 1);
    if (!error && data?.length) {
      const synth = insights.ledgerFromHands(data.slice(0, need), fromBalance);
      if (synth.length) source = rows.length ? "mixed" : "history";
      entries = entries.concat(synth);
      hasMore = data.length > need;
    }
  }
  return { entries, hasMore, source, ready: res.ready };
}

function handRow(r) {
  const p = r.player_hand && typeof r.player_hand === "object" ? r.player_hand : {};
  return {
    id: r.id,
    at: r.played_at,
    gameType: r.game_type || "blackjack",
    bet: Number(r.bet_amount) || 0,
    result: r.result,
    winAmount: Number(r.win_amount) || 0,
    delta: insights.handDelta(r),
    player: r.player_hand || null,
    dealer: r.dealer_hand || null,
    balanceAfter: p.balanceAfter ?? null,
    groupId: r.group_id || null,
  };
}

const RESULT_FILTER = { win: ["win", "blackjack"], loss: ["loss", "abandoned"], push: ["push"] };
const GAME_FILTER = { blackjack: "blackjack", slot: "slot", coinflip: "coinflip" };

/** Hand-by-hand history with replay data + the fair play summary of the window. */
async function playerHands(userId, { game = "all", result = "all", days = 7, limit = 30, before = null, openHands = 0 } = {}) {
  const lim = Math.max(1, Math.min(2000, Number(limit) || 30));
  const d = Number(days);
  const since = Number.isFinite(d) && d > 0 ? new Date(Date.now() - d * insights.DAY_MS).toISOString() : null;
  const build = (cols) => {
    let q = db().from("game_history").select(cols).eq("user_id", userId);
    if (GAME_FILTER[game]) q = q.eq("game_type", GAME_FILTER[game]);
    if (RESULT_FILTER[result]) q = q.in("result", RESULT_FILTER[result]);
    if (since) q = q.gte("played_at", since);
    return q;
  };
  let q = build("*");
  if (before) q = q.lt("played_at", before);
  const { data, error } = await q.order("played_at", { ascending: false }).limit(lim + 1);
  if (error) throw error;
  const rows = data || [];
  const windowRows = await pages(() => build(HAND_COLS).order("played_at", { ascending: false }), 20000);
  const fair = insights.fairPlay(windowRows, openHands);
  const abandoned = await casinoLedger.readTable("credit_ledger", (qq) => {
    let x = qq.select("id").eq("user_id", userId).eq("result", "abandoned");
    if (since) x = x.gte("created_at", since);
    return x.limit(1000);
  });
  fair.openHands += abandoned.rows.length;
  if (fair.openHands > 2) fair.status = "review";
  return { hands: rows.slice(0, lim).map(handRow), hasMore: rows.length > lim, fairPlay: fair };
}

async function handById(handId) {
  if (!isUuid(handId)) return null;
  const { data, error } = await db().from("game_history").select("*").eq("id", handId).maybeSingle();
  if (error) throw error;
  return data ? { ...handRow(data), userId: String(data.user_id) } : null;
}

/** Everything the workspace (right side) shows for one player. */
async function playerWorkspace(userId, { openHands = 0 } = {}) {
  const now = Date.now();
  const s = await snapshot();
  const [usersMap, walletRes, handsAll, ledgerRes, limitsRow, limitHistory] = await Promise.all([
    usersByIds([userId]),
    db().from("user_credits").select("*").eq("user_id", userId).maybeSingle(),
    pages(() => db().from("game_history").select(`${HAND_COLS}, group_id`).eq("user_id", userId).order("played_at", { ascending: false }), 50000),
    casinoLedger.readTable("credit_ledger", (q) => q.select("*").eq("user_id", userId).gte("created_at", new Date(now - 90 * insights.DAY_MS).toISOString()).order("created_at", { ascending: false }).limit(20000)),
    gameLimits.loadRow(userId),
    gameLimits.history(userId, 5),
  ]);
  const u = usersMap.get(String(userId));
  if (!u) return null;
  if (walletRes.error) throw walletRes.error;
  const wallet = walletRes.data || null;
  const credits = wallet ? Number(wallet.credits) || 0 : null;
  const sum = insights.summarizeHands(handsAll).get(String(userId)) || { hands: 0, wins: 0, net: 0, firstAt: null, lastAt: null };
  const ledger = ledgerRes.rows;
  const since30 = now - 30 * insights.DAY_MS;

  // Daily changes for the chart: ledger rows, plus hands before the ledger's first row.
  const oldestLedger = ledger.length ? new Date(ledger[ledger.length - 1].created_at).getTime() : Infinity;
  const entries = [
    ...ledger.map((e) => ({ at: e.created_at, delta: Number(e.delta) || 0, kind: e.kind })),
    ...handsAll.filter((h) => new Date(h.played_at).getTime() < oldestLedger).map((h) => ({ at: h.played_at, delta: insights.handDelta(h), kind: "game" })),
  ];
  const net30 = entries.filter((e) => new Date(e.at).getTime() >= since30).reduce((t, e) => t + e.delta, 0);
  const series = insights.balanceSeries({ days: 30, now, current: credits || 0, entries, hands: handsAll });
  const byGame = insights.gameStats(handsAll).map((g) => ({ game: g.game, hands: g.hands, winPct: g.winPct }));

  const dailyTimes = ledger.filter((e) => e.kind === "daily").map((e) => e.created_at);
  if (wallet?.last_daily_claim) dailyTimes.push(wallet.last_daily_claim);
  const streak = insights.bonusStreak(dailyTimes, now);

  const hidden = new Set([...s.limitsById.values()].filter((r) => r.leaderboard_hidden).map((r) => String(r.user_id)));
  const rank = credits == null || hidden.has(String(userId)) ? null : s.wallets.filter((w) => !hidden.has(String(w.user_id)) && (Number(w.credits) || 0) > credits).length + 1;

  // Where the last hand was played.
  const lastLedgerGame = ledger.find((e) => e.kind === "game" && e.context_kind);
  let lastContext = null;
  if (lastLedgerGame) {
    const labels = await contextLabels([lastLedgerGame]);
    lastContext = contextOf(lastLedgerGame, labels);
  } else if (handsAll[0]?.group_id) {
    const labels = await contextLabels([{ context_kind: "group", context_id: handsAll[0].group_id }]);
    lastContext = { kind: "group", id: handsAll[0].group_id, label: labels.get(`group:${handsAll[0].group_id}`) || null };
  }

  const limits = gameLimits.activeLimits(limitsRow, now);
  const anomalies = s.anomalies.filter((a) => a.userId === String(userId));
  return {
    player: {
      ...publicUser(u, userId),
      createdAt: u.created_at || null,
      ageVerified: ageVerified(u.birth_date, now),
    },
    wallet: wallet
      ? { credits, totalWon: Number(wallet.total_won) || 0, totalLost: Number(wallet.total_lost) || 0, gamesPlayed: Number(wallet.games_played) || 0, lastDailyClaim: wallet.last_daily_claim || null }
      : null,
    stats: {
      hands: Math.max(Number(wallet?.games_played) || 0, sum.hands),
      winRate: insights.winRate(sum),
      net30,
      bonusStreak: streak,
      rank,
      firstPlayedAt: sum.firstAt,
      lastPlayedAt: sum.lastAt,
      lastContext,
    },
    series,
    byGame,
    limits: { ...limits, stored: gameLimits.publicRow(limitsRow), history: limitHistory, ready: gameLimits.available() },
    flags: { risk: s.risk.get(String(userId)) || null, limited: limits.limited, frozen: limits.frozen, hidden: limits.leaderboardHidden },
    anomalies,
    fairPlayOpen: openHands,
    ready: { ledger: ledgerRes.ready, limits: gameLimits.available() },
  };
}

/** Statistics page: KPIs, circulation over time, per-game stats, anomalies, leaderboard. */
async function overview({ days = 30 } = {}) {
  const span = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const s = await snapshot();
  const now = Date.now();
  const since = now - span * insights.DAY_MS;
  const prevSince = now - 2 * span * insights.DAY_MS;
  const inWindow = s.hands.filter((h) => new Date(h.played_at).getTime() >= since);
  const prevWindow = s.hands.filter((h) => {
    const t = new Date(h.played_at).getTime();
    return t >= prevSince && t < since;
  });
  const total = s.wallets.reduce((t, w) => t + (Number(w.credits) || 0), 0);
  const series = insights.circulationSeries({ days: span, now, total, hands: s.hands, wallets: s.wallets, ledger: s.ledger, startingCredits: 1000 }).map((d) => ({
    ...d,
    players: s.wallets.filter((w) => !w.created_at || insights.istanbulDayKey(w.created_at) <= d.day).length,
    bonus: s.ledger.filter((e) => e.kind === "daily" && insights.istanbulDayKey(e.created_at) === d.day).length,
  }));
  const firstCredits = series[0]?.credits || 0;
  const weekAgo = now - 7 * insights.DAY_MS;
  const utcDay = Math.floor(now / insights.DAY_MS) * insights.DAY_MS;
  const bonusToday = s.wallets.filter((w) => w.last_daily_claim && new Date(w.last_daily_claim).getTime() >= utcDay).length;
  const nameById = new Map([...s.users].map(([id, u]) => [id, u.username]));
  const hidden = new Set([...s.limitsById.values()].filter((r) => r.leaderboard_hidden).map((r) => String(r.user_id)));
  const leaderboard = s.wallets.slice(0, 10).map((w, i) => ({
    rank: i + 1,
    ...publicUser(s.users.get(String(w.user_id)), String(w.user_id)),
    credits: Number(w.credits) || 0,
    hidden: hidden.has(String(w.user_id)),
    risk: s.risk.get(String(w.user_id)) || null,
  }));
  const anomalies = s.anomalies.slice(0, 50).map((a) => ({
    ...a,
    user: publicUser(s.users.get(a.userId), a.userId),
    related: (a.related || []).slice(0, 8).map((id) => publicUser(s.users.get(id), id)),
  }));
  const recent = s.hands.slice(0, 12).map((h) => ({
    id: h.id,
    at: h.played_at,
    gameType: h.game_type || "blackjack",
    bet: Number(h.bet_amount) || 0,
    result: h.result,
    delta: insights.handDelta(h),
    user: publicUser(s.users.get(String(h.user_id)), String(h.user_id)),
  }));
  const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null);
  return {
    days: span,
    kpis: {
      totalCredits: total,
      totalCreditsChange: pct(total, firstCredits),
      players: s.wallets.length,
      newPlayers7d: s.wallets.filter((w) => w.created_at && new Date(w.created_at).getTime() >= weekAgo).length,
      hands: inWindow.length,
      handsChange: pct(inWindow.length, prevWindow.length),
      avgCredits: s.wallets.length ? Math.round(total / s.wallets.length) : 0,
      bonusToday,
      bonusTodayCredits: bonusToday * 250,
    },
    series,
    games: insights.gameStats(inWindow, nameById),
    anomalies,
    leaderboard,
    recent,
    ready: s.ready,
    at: s.at,
  };
}

function _setClientForTests(client) {
  clientOverride = client;
  snap = null;
  snapAt = 0;
}

module.exports = {
  SORTS,
  FILTERS,
  snapshot,
  invalidate,
  listPlayers,
  playerWorkspace,
  playerLedger,
  playerHands,
  handById,
  overview,
  usersByIds,
  publicUser,
  ageVerified,
  isUuid,
  _setClientForTests,
};
