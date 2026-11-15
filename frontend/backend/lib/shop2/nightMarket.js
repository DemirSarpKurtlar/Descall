"use strict";

/**
 * Night market (pure). On market nights every user gets a personal face-down deck (default 6
 * cards, 3 flips). Each card is a not-owned item with a discount drawn from a skewed curve
 * (high discounts are rare), deterministic per (user, night). The card back shows only the
 * category as a hint.
 */

const { seedOf, rngFrom, weightedIndex } = require("./rng");
const { normalizeLimits, EPIC_PLUS } = require("./rules");
const time = require("./time");

/** Discount in [min, max], skewed toward min, rounded to 5. */
function drawDiscount(r, min, max, skew = 2.2) {
  const v = min + (max - min) * r ** skew;
  return Math.min(max, Math.max(min, Math.round(v / 5) * 5));
}

/** Default schedule: the configured weekdays at startHour Istanbul, durationHours long. */
function defaultWindows(fromMs, toMs, cfg) {
  const c = normalizeLimits({ nightMarket: cfg || {} }).nightMarket;
  if (!c.enabled) return [];
  const out = [];
  let day = time.addDays(time.dayKey(fromMs), -1);
  const last = time.dayKey(toMs);
  for (let i = 0; i < 400 && day <= last; i += 1, day = time.addDays(day, 1)) {
    const start = time.atLocalHour(day, c.startHour);
    const wd = new Date(time.dayStartMs(day) + 12 * time.HOUR_MS + time.TZ_OFFSET_MIN * 60_000).getUTCDay();
    if (!c.weekdays.includes(wd)) continue;
    const end = start + c.durationHours * time.HOUR_MS;
    if (end <= fromMs || start > toMs) continue;
    out.push({ id: `auto-${day}`, auto: true, startsAt: time.iso(start), endsAt: time.iso(end), cards: c.cards, flips: c.flips, discountMin: c.discountMin, discountMax: c.discountMax, skew: c.skew });
  }
  return out;
}

/** The open night at `now` and the next one after it. `nights` = merged list (rows + defaults). */
function nightState(nights, now = Date.now()) {
  const live = (nights || []).filter((n) => !["skipped", "cancelled"].includes(n.status));
  const sorted = [...live].sort((a, b) => time.ms(a.startsAt) - time.ms(b.startsAt));
  const open = sorted.find((n) => time.ms(n.startsAt) <= now && now < time.ms(n.endsAt)) || null;
  const next = sorted.find((n) => time.ms(n.startsAt) > now) || null;
  return { open, next };
}

/**
 * Personal deck.
 * @param {object} p { userId, night: { id, cards, discountMin, discountMax, skew }, pool, owned, categoryHints? }
 */
function deckFor(p) {
  const night = p.night || {};
  const cfg = normalizeLimits({ nightMarket: { cards: night.cards, discountMin: night.discountMin, discountMax: night.discountMax, skew: night.skew } }).nightMarket;
  const seed = seedOf("shop2-night", p.userId, night.id);
  const rng = rngFrom(seed);
  const owned = new Set([...(p.owned || [])].map(String));
  const pool = [...(p.pool || [])]
    .filter((it) => it && it.active && !it.retired && !owned.has(String(it.id)) && it.category !== "countries")
    .sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1));
  const cards = [];
  const taken = new Set();
  const cats = new Map();
  for (let i = 0; i < cfg.cards; i += 1) {
    const cands = pool.filter((it) => !taken.has(String(it.id)));
    if (!cands.length) break;
    // Mythic and legendary are the point of the night market: they weigh more here.
    const weights = cands.map((it) => {
      const base = it.rarity === "mythic" ? 0.5 : it.rarity === "legendary" ? 0.9 : EPIC_PLUS.has(it.rarity) ? 1.2 : it.rarity === "rare" ? 1 : 0.7;
      return base * 0.4 ** (cats.get(it.category) || 0);
    });
    let idx = weightedIndex(rng, weights);
    if (idx < 0) idx = 0;
    const item = cands[idx];
    taken.add(String(item.id));
    cats.set(item.category, (cats.get(item.category) || 0) + 1);
    const discountPct = drawDiscount(rng(), cfg.discountMin, cfg.discountMax, cfg.skew);
    const listPrice = Math.max(0, Math.round(Number(item.price) || 0));
    cards.push({ index: i, itemId: item.id, hint: item.category, rarity: item.rarity, discountPct, listPrice, price: Math.max(0, Math.round((listPrice * (100 - discountPct)) / 100 / 10) * 10) });
  }
  return { seed, cards };
}

/** Histogram of the discount curve (admin scheduler "distribution chart"). */
function discountDistribution({ discountMin = 15, discountMax = 60, skew = 2.2, samples = 2000 } = {}) {
  const rng = rngFrom(seedOf("shop2-night-dist", discountMin, discountMax, skew));
  const buckets = new Map();
  for (let i = 0; i < samples; i += 1) {
    const d = drawDiscount(rng(), discountMin, discountMax, skew);
    buckets.set(d, (buckets.get(d) || 0) + 1);
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([pct, n]) => ({ pct, share: Math.round((n / samples) * 1000) / 10 }));
}

module.exports = { drawDiscount, defaultWindows, nightState, deckFor, discountDistribution };
