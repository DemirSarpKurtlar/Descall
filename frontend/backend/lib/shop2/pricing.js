"use strict";

/**
 * Set pricing (pure). A set costs the sum of its 8 pieces minus 20-30 %, rounded to 10 D.
 * Owned pieces are deducted at the same set ratio (you pay the set rate for what you are
 * missing). Buying a piece on its own opens a 7-day partial-price window: while it lasts the
 * remaining pieces cost the set rate, one by one or together, even after the set leaves the
 * shop or its discount changes (the better of the locked and the live discount wins).
 */

const { hash01 } = require("./rng");
const time = require("./time");

function round10(n) {
  return Math.max(0, Math.round((Number(n) || 0) / 10) * 10);
}

function clampDiscount(pct, min = 20, max = 30) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return Math.round((min + max) / 2);
  return Math.min(max, Math.max(min, Math.round(n)));
}

function setPriceOf(sum, discountPct) {
  return round10(sum * (1 - discountPct / 100));
}

/** A/B arm of a user in a test: "B" for the first `split` % of a stable hash, else "A". */
function abArm(userId, test) {
  if (!test || !userId) return null;
  const split = Math.min(100, Math.max(0, Number(test.split ?? 50)));
  return hash01("shop2-ab", test.id, userId) * 100 < split ? "B" : "A";
}

/**
 * @param {object} p
 * @param {Array<{id, price}>} p.pieces
 * @param {Iterable} [p.ownedIds]
 * @param {number} p.discountPct          live set discount (already clamped by the caller's limits)
 * @param {{discountPct, until}} [p.lock] partial-price window
 * @param {boolean} [p.onSale]            set is live now (schedule, stock, not recalled)
 * @param {number} [p.now]
 */
function setQuote(p) {
  const now = time.ms(p.now) ?? Date.now();
  const owned = new Set([...(p.ownedIds || [])].map(String));
  const pieces = (p.pieces || []).map((x) => ({ id: String(x.id), price: Math.max(0, Math.round(Number(x.price) || 0)) }));
  const sum = pieces.reduce((a, x) => a + x.price, 0);
  const liveDiscount = Number(p.discountPct) || 0;
  const lockUntil = p.lock && time.ms(p.lock.until);
  const lockActive = Boolean(p.lock && lockUntil != null && lockUntil > now);
  const discountPct = lockActive ? Math.max(liveDiscount, Number(p.lock.discountPct) || 0) : liveDiscount;
  const setPrice = setPriceOf(sum, discountPct);
  const ratio = sum > 0 ? setPrice / sum : 1;
  const missing = pieces.filter((x) => !owned.has(x.id));
  const ownedSum = sum - missing.reduce((a, x) => a + x.price, 0);
  const remainingSum = sum - ownedSum;
  const onSale = p.onSale !== false;
  const setRateOpen = onSale || lockActive;
  const yourPrice = missing.length === 0 ? 0 : missing.length === pieces.length ? setPrice : round10(remainingSum * ratio);
  return {
    sum,
    setPrice,
    discountPct,
    liveDiscountPct: liveDiscount,
    ratio,
    ownedCount: pieces.length - missing.length,
    total: pieces.length,
    ownedSum,
    remainingSum,
    ownedDeducted: missing.length && missing.length < pieces.length ? setPrice - yourPrice : 0,
    yourPrice: setRateOpen ? yourPrice : null,
    savings: setRateOpen && missing.length ? remainingSum - yourPrice : 0,
    complete: missing.length === 0,
    missingIds: missing.map((x) => x.id),
    partialPriceUntil: lockActive ? time.iso(lockUntil) : null,
    setRateOpen,
  };
}

/**
 * Price of buying `pieceIds` from a set right now.
 * All missing pieces -> the set quote. Otherwise each piece at full price, or at the set rate
 * while a partial-price window is open. `opensLock` = this purchase starts a 7-day window.
 */
function piecesQuote(quote, pieces, pieceIds) {
  const want = [...new Set((pieceIds || []).map(String))].filter((id) => quote.missingIds.includes(id));
  const priceById = new Map((pieces || []).map((x) => [String(x.id), Math.max(0, Math.round(Number(x.price) || 0))]));
  if (!want.length) return { ids: [], price: 0, list: 0, mode: "none", opensLock: false };
  const list = want.reduce((a, id) => a + (priceById.get(id) || 0), 0);
  if (want.length === quote.missingIds.length && quote.yourPrice != null) {
    return { ids: want, price: quote.yourPrice, list, mode: "set", opensLock: false };
  }
  if (quote.partialPriceUntil) {
    return { ids: want, price: round10(list * quote.ratio), list, mode: "partial", opensLock: false };
  }
  return { ids: want, price: list, list, mode: "pieces", opensLock: true };
}

/**
 * 30-day daily price series from change points [{ at, price }] (ascending or not) and the
 * current price. Each day carries the price in force at the end of that day.
 */
function priceHistory(points, { now = Date.now(), days = 30, current = null } = {}) {
  const pts = [...(points || [])]
    .map((x) => ({ t: time.ms(x.at), price: Math.round(Number(x.price) || 0) }))
    .filter((x) => x.t != null)
    .sort((a, b) => a.t - b.t);
  const today = time.dayKey(now);
  const first = time.addDays(today, -(days - 1));
  const out = [];
  let k = 0;
  let price = null;
  while (k < pts.length && pts[k].t < time.dayStartMs(first)) price = pts[k++].price;
  for (const day of time.dayRange(first, days)) {
    const end = time.dayStartMs(day) + time.DAY_MS;
    while (k < pts.length && pts[k].t < end) price = pts[k++].price;
    out.push({ day, price: day === today && current != null ? current : price });
  }
  const known = out.filter((x) => x.price != null).map((x) => x.price);
  const lowest = known.length ? Math.min(...known) : null;
  return { days: out, lowest30d: lowest, isLowest: current != null && lowest != null && current <= lowest };
}

/** Admin set builder: single items, pieces, sum and set price on one ladder. */
function priceLadder({ pieces = [], setPrice = 0, singleBands = null }) {
  const bands = singleBands || { common: [150, 300], rare: [300, 550], epic: [550, 900], legendary: [900, 1500] };
  const prices = pieces.map((x) => Number(x.price) || 0);
  const sum = prices.reduce((a, b) => a + b, 0);
  return {
    singleMax: bands.legendary[1],
    bands,
    pieceMin: prices.length ? Math.min(...prices) : 0,
    pieceMax: prices.length ? Math.max(...prices) : 0,
    sum,
    setPrice,
    discountPct: sum ? Math.round((1 - setPrice / sum) * 1000) / 10 : 0,
    farAboveSingles: setPrice >= bands.legendary[1] * 2,
  };
}

/**
 * Suggested discount from earlier sets' conversion: sets that converted below the median at
 * their discount pull the suggestion up, strong ones pull it down. Stays inside [min, max].
 */
function suggestDiscount(history = [], { min = 20, max = 30 } = {}) {
  const rows = history.filter((h) => Number.isFinite(Number(h.discountPct)) && Number.isFinite(Number(h.conversion)));
  if (rows.length < 2) return { pct: Math.round((min + max) / 2), basis: "default", samples: rows.length };
  const conv = rows.map((r) => Number(r.conversion)).sort((a, b) => a - b);
  const median = conv[Math.floor(conv.length / 2)];
  const best = rows.reduce((a, r) => (Number(r.conversion) > Number(a.conversion) ? r : a), rows[0]);
  const pct = clampDiscount(Number(best.discountPct) + (Number(best.conversion) < median ? 2 : 0), min, max);
  return { pct, basis: "history", samples: rows.length, median };
}

/** "Who pays what": what each ownership segment pays for the set. */
function payerSegments(quoteFor, segments) {
  return segments.map((s) => {
    const q = quoteFor(s.ownedIds || []);
    return { key: s.key, users: s.users ?? null, ownedCount: q.ownedCount, pays: q.yourPrice, deducted: q.ownedDeducted };
  });
}

module.exports = { round10, clampDiscount, setPriceOf, abArm, setQuote, piecesQuote, priceHistory, priceLadder, suggestDiscount, payerSegments };
