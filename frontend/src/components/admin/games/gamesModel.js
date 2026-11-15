/**
 * Oyunlar / Kredi (admin, owner pick Draft B "Oyuncu çalışma alanı"): pure helpers
 * shared by the page, the hand history drawer, the limits dialog and the credit
 * dialog. No React, no fetch: selftested in games.selftest.mjs.
 * Game credits are points only (never money, never DesCoin, never convertible).
 */

export const GLOBAL_MIN_BET = 10;
export const GLOBAL_MAX_BET = 25000;
export const STARTING_CREDITS = 1000;
export const REASON_MIN = 5;
export const REASON_MAX = 500;
export const MAX_ADJUST = 10000000;

export const PAGE_TABS = Object.freeze(["players", "stats", "rules"]);
export const LIST_FILTERS = Object.freeze(["all", "risky", "limited", "frozen"]);
export const LIST_SORTS = Object.freeze(["balance", "hands", "winrate", "recent"]);
export const LEDGER_FILTERS = Object.freeze(["all", "game", "bonus", "transfer", "admin"]);
export const HAND_GAMES = Object.freeze(["all", "blackjack", "slot", "coinflip"]);
export const HAND_RESULTS = Object.freeze(["all", "win", "loss"]);
export const HAND_DAYS = Object.freeze(["1", "7", "30", "90", "all"]);
export const FREEZE_OPTIONS = Object.freeze(["none", "24h", "7d", "30d", "forever"]);
export const ADJUST_OPS = Object.freeze(["add", "remove", "set"]);
export const ADJUST_PRESETS = Object.freeze([250, 1000, 5000, 10000, 25000]);
export const ADJUST_CATEGORIES = Object.freeze(["support", "event", "bugfix", "abuse", "other"]);
export const STAT_DAYS = Object.freeze([7, 30, 90]);

/** Slider ranges of the limits dialog (0 = off where the row allows it). */
export const LIMIT_RANGES = Object.freeze({
  maxBet: { min: GLOBAL_MIN_BET, max: GLOBAL_MAX_BET, step: 10, off: false },
  dailyLossCap: { min: 0, max: 50000, step: 500, off: true },
  dailyHandCap: { min: 0, max: 400, step: 5, off: true },
});

/** Avatar gradients of the draft, picked by a stable hash of the user id. */
export const AVATAR_GRADIENTS = Object.freeze([
  ["#4fe0a0", "#1f9a62"],
  ["#ff7a7d", "#c9363a"],
  ["#ff7eb6", "#c2407e"],
  ["#4fd2e0", "#1f8a9a"],
  ["#6d8cff", "#4a5fd6"],
  ["#b58cff", "#7a4fd6"],
  ["#ff9a5c", "#c75a26"],
  ["#ffd36b", "#d69a1f"],
  ["#9aa3c7", "#5b6385"],
]);

export function gradientFor(id) {
  const s = String(id || "");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

export function initialOf(user) {
  const name = String(user?.username || user?.displayName || "?").replace(/^@/, "");
  return (name[0] || "?").toLocaleUpperCase("tr");
}

/** Game label keys (short = ledger / drawer, long = per-game card). */
export function gameKey(game, long = false) {
  const g = ["blackjack", "slot", "coinflip"].includes(game) ? game : "blackjack";
  return `gamesAdmin.game.${g}${long ? "Long" : ""}`;
}

/** Result chip: tone + label key. */
export function resultChip(result) {
  switch (result) {
    case "blackjack":
      return { tone: "bj", key: "gamesAdmin.result.blackjack" };
    case "win":
      return { tone: "w", key: "gamesAdmin.result.win" };
    case "push":
      return { tone: "p", key: "gamesAdmin.result.push" };
    case "abandoned":
      return { tone: "l", key: "gamesAdmin.result.abandoned" };
    default:
      return { tone: "l", key: "gamesAdmin.result.loss" };
  }
}

/* ---------------- Blackjack replay ---------------- */

const RANK_VALUE = { A: 11, J: 10, Q: 10, K: 10 };

export function cardValue(card) {
  if (!card || card.hidden) return 0;
  if (Number.isFinite(card.value)) return card.value;
  return RANK_VALUE[card.rank] ?? (Number(card.rank) || 0);
}

/** Best blackjack total of a list of cards (aces count 1 when 11 would bust). */
export function handTotal(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards || []) {
    if (!c || c.hidden) continue;
    const v = cardValue(c);
    total += v;
    if (c.rank === "A") aces += 1;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

export function isRedSuit(suit) {
  return suit === "♥" || suit === "♦";
}

/**
 * Step-by-step replay of one finished hand.
 * Blackjack: dealt (2 + dealer up card), each hit / double, the dealer, the result.
 * Older rows without `steps` are rebuilt from the card order.
 * Coin flip: call, face, result. Slot: the grid, result.
 * Every step: { kind, labelKey, labelVars, cards?, dealer?, noteKey, noteVars }.
 */
export function replaySteps(hand) {
  if (!hand) return [];
  const result = {
    kind: "result",
    labelKey: "gamesAdmin.replay.result",
    delta: Number(hand.delta) || 0,
    balanceAfter: hand.balanceAfter ?? null,
    result: hand.result,
  };
  if (hand.gameType === "coinflip") {
    const p = hand.player || {};
    return [
      { kind: "call", labelKey: "gamesAdmin.replay.call", noteKey: p.call === "tails" ? "gamesAdmin.coin.tails" : "gamesAdmin.coin.heads", coin: p.call || null },
      { kind: "face", labelKey: "gamesAdmin.replay.face", noteKey: p.face === "tails" ? "gamesAdmin.coin.tails" : "gamesAdmin.coin.heads", coin: p.face || null },
      result,
    ];
  }
  if (hand.gameType === "slot") {
    const p = hand.player || {};
    return [{ kind: "grid", labelKey: "gamesAdmin.replay.spin", grid: Array.isArray(p.grid) ? p.grid : [], freeSpins: Number(p.freeSpins) || 0 }, result];
  }
  const player = Array.isArray(hand.player?.cards) ? hand.player.cards : [];
  const dealer = Array.isArray(hand.dealer?.cards) ? hand.dealer.cards : [];
  const steps = [];
  const dealt = player.slice(0, 2);
  const upCard = dealer.slice(0, 1);
  steps.push({
    kind: "deal",
    labelKey: "gamesAdmin.replay.dealt",
    cards: dealt,
    noteKey: "gamesAdmin.replay.dealtNote",
    noteVars: { player: handTotal(dealt), dealer: handTotal(upCard) },
  });
  const actions = Array.isArray(hand.player?.steps) ? hand.player.steps.filter((a) => a === "hit" || a === "double") : null;
  for (let i = 2; i < player.length; i += 1) {
    const cards = player.slice(0, i + 1);
    const total = handTotal(cards);
    const isDouble = actions ? actions[i - 2] === "double" : hand.player?.doubled && i === 2;
    steps.push({
      kind: isDouble ? "double" : "hit",
      labelKey: isDouble ? "gamesAdmin.replay.doubled" : "gamesAdmin.replay.hit",
      cards,
      noteKey: total > 21 ? "gamesAdmin.replay.bust" : "gamesAdmin.replay.playerTotal",
      noteVars: { n: total },
    });
  }
  const playerTotal = handTotal(player);
  const naturals = player.length === 2 && playerTotal === 21;
  if (playerTotal <= 21 && dealer.length) {
    const dTotal = handTotal(dealer);
    let noteKey = "gamesAdmin.replay.dealerStood";
    if (dTotal > 21) noteKey = "gamesAdmin.replay.dealerBust";
    else if (dealer.length === 2 && dTotal === 21) noteKey = "gamesAdmin.replay.dealerBlackjack";
    else if (naturals) noteKey = "gamesAdmin.replay.dealerShown";
    steps.push({ kind: "dealer", labelKey: "gamesAdmin.replay.dealer", cards: dealer, noteKey, noteVars: { n: dTotal } });
  }
  steps.push(result);
  return steps.map((s, i) => ({ ...s, index: i + 1 }));
}

/** Short text for the hand row's "Eller" column when it is not cards (coin flip / slot). */
export function handSummary(hand) {
  if (hand?.gameType === "coinflip") {
    return {
      key: "gamesAdmin.drawer.coinSummary",
      vars: { call: hand.player?.call === "tails" ? "tails" : "heads", face: hand.player?.face === "tails" ? "tails" : "heads" },
    };
  }
  if (hand?.gameType === "slot") {
    return { key: "gamesAdmin.drawer.slotSummary", vars: { paid: Number(hand.winAmount) || 0, free: Number(hand.player?.freeSpins) || 0 } };
  }
  return null;
}

/* ---------------- Ledger rows ---------------- */

/**
 * How a ledger entry reads: icon id, tone, title key + vars, sub parts.
 * Sub parts are [{ key, vars }] joined with " · " by the view.
 */
export function ledgerView(entry) {
  const e = entry || {};
  const parts = [];
  const ctx = e.context;
  const ctxPart = () => {
    if (!ctx) return null;
    if (ctx.kind === "dm") return { key: "gamesAdmin.ledger.ctxDm", vars: { name: ctx.label || "?" } };
    if (ctx.kind === "channel") return { key: "gamesAdmin.ledger.ctxChannel", vars: { name: ctx.label || "?" } };
    return { key: "gamesAdmin.ledger.ctxGroup", vars: { name: ctx.label || "?" } };
  };
  switch (e.kind) {
    case "daily":
      return { icon: "gift", tone: "teal", titleKey: "gamesAdmin.ledger.daily", parts: [{ key: "gamesAdmin.ledger.auto" }] };
    case "transfer_out":
      return { icon: "send", tone: "violet", titleKey: "gamesAdmin.ledger.transferOut", titleVars: { name: e.counterparty?.username || "?" }, parts: [{ key: "gamesAdmin.ledger.payCommand" }, ctxPart()].filter(Boolean) };
    case "transfer_in":
      return { icon: "send", tone: "violet", titleKey: "gamesAdmin.ledger.transferIn", titleVars: { name: e.counterparty?.username || "?" }, parts: [{ key: "gamesAdmin.ledger.payCommand" }, ctxPart()].filter(Boolean) };
    case "admin":
      return {
        icon: "coin",
        tone: "amber",
        titleKey: "gamesAdmin.ledger.admin",
        titleVars: { name: e.actor || "?" },
        parts: [e.category ? { key: `gamesAdmin.category.${e.category}` } : null, e.reason ? { text: e.reason } : null].filter(Boolean),
      };
    case "reset":
      return { icon: "undo", tone: "red", titleKey: "gamesAdmin.ledger.reset", titleVars: { name: e.actor || "?" }, parts: e.reason ? [{ text: e.reason }] : [] };
    default: {
      const chip = resultChip(e.result);
      if (e.bet != null) parts.push({ key: "gamesAdmin.ledger.stake", vars: { n: Number(e.bet) || 0 } });
      const c = ctxPart();
      if (c) parts.push(c);
      const icon = e.gameType === "slot" ? "coin" : e.gameType === "coinflip" ? "flip" : "cards";
      return {
        icon,
        tone: (Number(e.delta) || 0) > 0 ? "green" : (Number(e.delta) || 0) < 0 ? "red" : "gray",
        titleKey: "gamesAdmin.ledger.game",
        titleVars: { game: gameKey(e.gameType), result: chip.key },
        parts,
      };
    }
  }
}

/** Admin adjustments summary for the credit dialog: count + net over 30 days. */
export function adjustmentSummary(entries, now = Date.now()) {
  const since = now - 30 * 86400000;
  const list = (entries || []).filter((e) => (e.kind === "admin" || e.kind === "reset") && new Date(e.at).getTime() >= since);
  return { count: list.length, net: list.reduce((s, e) => s + (Number(e.delta) || 0), 0) };
}

/* ---------------- Credit dialog ---------------- */

export function parseAmount(text) {
  const digits = String(text ?? "").replace(/[^\d]/g, "");
  if (!digits) return 0;
  const n = Number(digits);
  return Number.isFinite(n) ? Math.min(n, MAX_ADJUST) : 0;
}

export function previewBalance(current, op, amount) {
  const c = Math.max(0, Number(current) || 0);
  const a = Math.max(0, Number(amount) || 0);
  if (op === "add") return c + a;
  if (op === "remove") return Math.max(0, c - a);
  return a;
}

export function canSubmitAdjust({ op, amount, reason }) {
  if (!ADJUST_OPS.includes(op)) return false;
  const a = Number(amount);
  if (!Number.isFinite(a) || a > MAX_ADJUST) return false;
  if (op === "set" ? a < 0 : a < 1) return false;
  return String(reason || "").trim().length >= REASON_MIN;
}

export function reasonOk(reason) {
  const n = String(reason || "").trim().length;
  return n >= REASON_MIN && n <= REASON_MAX;
}

/** Rank after a balance change, from the visible list (balance sort, hidden excluded). */
export function rankAfter(players, userId, balance) {
  const others = (players || []).filter((p) => p.id !== userId && !p.flags?.hidden);
  return others.filter((p) => (Number(p.credits) || 0) > balance).length + 1;
}

/* ---------------- Limits dialog ---------------- */

/** Dialog form from the stored limits (null = none stored). */
export function limitsForm(stored, now = Date.now()) {
  const s = stored || {};
  const frozenNow = Boolean(s.freezeIndefinite || (s.frozenUntil && new Date(s.frozenUntil).getTime() > now));
  return {
    maxBet: s.maxBet ?? GLOBAL_MAX_BET,
    dailyLossCap: s.dailyLossCap ?? 0,
    dailyHandCap: s.dailyHandCap ?? 0,
    transfersEnabled: s.transfersEnabled !== false,
    freeze: frozenNow ? "keep" : "none",
    expiresAt: s.expiresAt ? String(s.expiresAt).slice(0, 10) : "",
    autoLift: s.autoLift !== false,
    reason: "",
  };
}

/** PUT /credits/players/:id/limits body from the form (global max per hand = no personal cap). */
export function limitsBody(form) {
  return {
    maxBet: form.maxBet && form.maxBet < GLOBAL_MAX_BET ? form.maxBet : null,
    dailyLossCap: form.dailyLossCap > 0 ? form.dailyLossCap : null,
    dailyHandCap: form.dailyHandCap > 0 ? form.dailyHandCap : null,
    transfersEnabled: Boolean(form.transfersEnabled),
    freeze: form.freeze,
    // End of that Istanbul day.
    expiresAt: form.expiresAt ? `${form.expiresAt}T23:59:59+03:00` : null,
    autoLift: Boolean(form.autoLift),
    reason: String(form.reason || "").trim(),
  };
}

/** The limits a form would put in place (same shape as lib/gameLimits activeLimits). */
export function formLimits(form, stored, now = Date.now()) {
  const body = limitsBody(form);
  let frozen = false;
  let frozenUntil = null;
  let indefinite = false;
  if (form.freeze === "forever") {
    frozen = true;
    indefinite = true;
  } else if (form.freeze === "keep") {
    indefinite = Boolean(stored?.freezeIndefinite);
    frozenUntil = indefinite ? null : stored?.frozenUntil || null;
    frozen = indefinite || Boolean(frozenUntil && new Date(frozenUntil).getTime() > now);
  } else if (form.freeze !== "none") {
    const hours = { "24h": 24, "7d": 168, "30d": 720 }[form.freeze] || 0;
    frozen = hours > 0;
    frozenUntil = frozen ? new Date(now + hours * 3600000).toISOString() : null;
  }
  return {
    maxBet: body.maxBet,
    dailyLossCap: body.dailyLossCap,
    dailyHandCap: body.dailyHandCap,
    transfersEnabled: body.transfersEnabled,
    frozen,
    frozenUntil,
    indefinite,
    expiresAt: body.expiresAt ? new Date(body.expiresAt).toISOString() : null,
  };
}

function botRef(key, vars) {
  return vars ? { key: `gamesAdmin.bot.${key}`, vars } : { key: `gamesAdmin.bot.${key}` };
}

function noticeRef(main, limits) {
  const valid = limits?.expiresAt ? botRef("validUntil", { date: { date: limits.expiresAt } }) : "";
  return botRef("notice", { main, valid });
}

/**
 * The bot message the player would get (mirror of lib/gameLimits.js previewNotice,
 * checked against it in the selftest). Null = nothing changes for the player.
 */
export function previewNotice(limits) {
  if (!limits) return null;
  if (limits.frozen) {
    return noticeRef(limits.indefinite ? botRef("frozen") : botRef("frozenUntil", { until: { dateTime: limits.frozenUntil } }), null);
  }
  if (limits.dailyLossCap) return noticeRef(botRef("dailyLoss", { cap: limits.dailyLossCap }), limits);
  if (limits.dailyHandCap) return noticeRef(botRef("dailyHands", { cap: limits.dailyHandCap }), limits);
  if (limits.maxBet) return noticeRef(botRef("maxBet", { max: limits.maxBet }), limits);
  if (!limits.transfersEnabled) return noticeRef(botRef("transfersOff"), limits);
  return null;
}

/**
 * "Değişiklik" rows: [{ id, from, to, changed }] with raw values; the view formats
 * them (null = "yok", false / true = "kapalı" / "açık").
 */
export function limitsDiff(stored, form, now = Date.now()) {
  const before = stored || {};
  const next = formLimits(form, stored, now);
  const freezeBefore = before.freezeIndefinite ? "forever" : before.frozenUntil && new Date(before.frozenUntil).getTime() > now ? before.frozenUntil : null;
  const freezeAfter = next.indefinite ? "forever" : next.frozenUntil || null;
  const rows = [
    { id: "maxBet", from: before.maxBet ?? GLOBAL_MAX_BET, to: next.maxBet ?? GLOBAL_MAX_BET },
    { id: "dailyLossCap", from: before.dailyLossCap ?? null, to: next.dailyLossCap },
    { id: "dailyHandCap", from: before.dailyHandCap ?? null, to: next.dailyHandCap },
    { id: "transfers", from: before.transfersEnabled !== false, to: next.transfersEnabled },
    { id: "freeze", from: freezeBefore, to: form.freeze === "keep" ? freezeBefore : freezeAfter },
  ];
  return rows.map((r) => ({ ...r, changed: r.id === "freeze" && form.freeze !== "keep" && form.freeze !== "none" ? true : r.from !== r.to }));
}

/** Slider percent of a value in its range. */
export function sliderPct(id, value) {
  const r = LIMIT_RANGES[id];
  if (!r) return 0;
  const v = Math.min(r.max, Math.max(r.min, Number(value) || 0));
  return Math.round(((v - r.min) / (r.max - r.min)) * 1000) / 10;
}

/** Short summary parts of a limits object for "Aktif limitler" / "Önceki limit". */
export function limitParts(l) {
  if (!l) return [];
  const out = [];
  if (l.frozen || l.freezeIndefinite || l.indefinite) out.push({ key: l.indefinite || l.freezeIndefinite ? "gamesAdmin.limits.partFrozen" : "gamesAdmin.limits.partFrozenUntil", vars: { date: l.frozenUntil } });
  if (l.maxBet) out.push({ key: "gamesAdmin.limits.partMaxBet", vars: { n: l.maxBet } });
  if (l.dailyLossCap) out.push({ key: "gamesAdmin.limits.partLoss", vars: { n: l.dailyLossCap } });
  if (l.dailyHandCap) out.push({ key: "gamesAdmin.limits.partHands", vars: { n: l.dailyHandCap } });
  if (l.transfersEnabled === false) out.push({ key: "gamesAdmin.limits.partNoTransfer" });
  if (l.expiresAt) out.push({ key: "gamesAdmin.limits.partUntil", vars: { date: l.expiresAt } });
  return out;
}

/* ---------------- Chart ---------------- */

/**
 * SVG geometry of the balance / circulation chart: line + area path over
 * `values`, bars for `bars`, x of every point. Pure numbers (viewBox units).
 */
export function chartGeometry(values, bars, { width = 380, height = 150, pad = 10, barShare = 0.55 } = {}) {
  const vals = (values || []).map((v) => Number(v) || 0);
  const n = vals.length;
  const ch = height;
  if (!n) return { line: "", area: "", bars: [], xs: [], ys: [], min: 0, max: 0 };
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const span = max - min || 1;
  const xs = vals.map((_, i) => (n === 1 ? width / 2 : (i * width) / (n - 1)));
  const ys = vals.map((v) => ch - pad - ((v - min) / span) * (ch - 2 * pad));
  const line = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
  const area = `${line} L${width} ${ch} L0 ${ch}Z`;
  const b = (bars || []).map((v) => Math.max(0, Number(v) || 0));
  const bm = Math.max(1, ...b);
  const bw = width / Math.max(1, b.length);
  const barRects = b.map((v, i) => {
    const h = (v / bm) * ch * barShare;
    return { x: i * bw + bw * 0.22, y: ch - h, w: bw * 0.56, h, value: v };
  });
  return { line, area, bars: barRects, xs, ys, min, max };
}

/** Sparkline path for KPI tiles. */
export function sparkPath(values, width = 200, height = 22) {
  return chartGeometry(values, [], { width, height, pad: 3 });
}

/* ---------------- Misc ---------------- */

export function deltaTone(n) {
  const v = Number(n) || 0;
  return v > 0 ? "pos" : v < 0 ? "neg" : "zero";
}

/** Deep link to one hand: "#games/<userId>/<handId>" (read back by the page). */
export function handLink(origin, userId, handId) {
  return `${String(origin || "").replace(/\/$/, "")}/admin/panel#games/${userId}/${handId}`;
}

export function parseHandLink(hash) {
  const m = /^#games\/([0-9a-f-]{36})(?:\/([0-9a-f-]{36}))?$/i.exec(String(hash || ""));
  return m ? { userId: m[1], handId: m[2] || null } : null;
}

/** Days a hand list filter covers: "all" -> "all", otherwise the number. */
export function daysParam(days) {
  return HAND_DAYS.includes(String(days)) ? String(days) : "7";
}

/** Query string from an object (skips empty values). */
export function qs(params) {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === "") continue;
    out.set(k, String(v));
  }
  const s = out.toString();
  return s ? `?${s}` : "";
}

/** Fold for Turkish-aware search (İ / ı / accents). */
export function foldTr(v) {
  return String(v || "")
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i");
}

/** Anomaly row: icon + tone by type, severity tone. */
export function anomalyView(a) {
  const icon = { streak: "zap", winRate: "trend", multiTransfer: "users", farming: "gift", jump: "trend" }[a?.type] || "alert";
  const color = { streak: "red", winRate: "amber", multiTransfer: "amber", farming: "violet", jump: "blue" }[a?.type] || "blue";
  const sev = { high: "red", medium: "gold", low: "blue" }[a?.severity] || "blue";
  return { icon, color, sev, titleKey: `gamesAdmin.anomaly.${a?.type || "streak"}`, subKey: `gamesAdmin.anomaly.${a?.type || "streak"}Sub`, sevKey: `gamesAdmin.severity.${a?.severity || "low"}` };
}

/** Risk dot colour in the list (high = red, medium / low = amber, limited / frozen = violet). */
export function flagDot(flags) {
  if (!flags) return null;
  if (flags.risk === "high") return "red";
  if (flags.risk) return "amber";
  if (flags.frozen || flags.limited) return "violet";
  return null;
}
