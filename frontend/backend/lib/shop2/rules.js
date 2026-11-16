"use strict";

/**
 * Storefront rule versions (weights, slot price bands, toggles) and the shop limits
 * (refresh price, gift caps, purchase windows, night market defaults). Both are plain JSON,
 * normalized here so a bad admin payload can never produce a broken storefront.
 */

const RARITIES = ["common", "rare", "epic", "legendary", "mythic"];
const EPIC_PLUS = new Set(["epic", "legendary", "mythic"]);
const RARITY_RANK = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };

const DEFAULT_RULES = Object.freeze({
  weights: {
    rarity: { common: 1, rare: 0.8, epic: 0.45, legendary: 0.18, mythic: 0 },
    category: {},
    freshnessPerDay: 0.04,
    freshnessCapDays: 25,
    newItemBoost: 1.5,
    newItemDays: 14,
    wishlistBoost: 2.5,
    setAffinityBoost: 1.3,
    sameCategoryPenalty: 0.35,
  },
  bands: [
    { slot: 1, min: 150, max: 450 },
    { slot: 2, min: 300, max: 900 },
    { slot: 3, min: 450, max: 1200 },
    { slot: 4, min: 600, max: 1500 },
  ],
  toggles: {
    epicFloor: true,
    noRepeatDays: 7,
    includeSetPieces: true,
    wishlistBoost: true,
    diverseCategories: true,
    newAccountDays: 3,
    newAccountMaxPrice: 600,
    lockEnabled: true,
    excludeCategories: ["countries"],
  },
});

const DEFAULT_LIMITS = Object.freeze({
  refresh: { price: 150, perDay: 1, premiumFree: true, streakDays: 7 },
  gifts: {
    enabled: true,
    frozen: false,
    perDay: 3,
    perRecipientDay: 1,
    receivePerDay: 5,
    minAccountDaysSend: 7,
    minAccountDaysSetBuy: 3,
    maxMessage: 140,
    maxScheduleDays: 30,
    ringDetection: true,
    ringWindowDays: 7,
  },
  purchases: { refundMinutes: 10, partialLockDays: 7, setDiscountMin: 20, setDiscountMax: 30, actionUndoMinutes: 10 },
  nightMarket: {
    enabled: true,
    weekdays: [5, 6],
    startHour: 22,
    durationHours: 4,
    cards: 6,
    flips: 3,
    keepMax: 2,
    discountMin: 15,
    discountMax: 60,
    skew: 2.2,
    coOpenBonus: 1,
  },
});

function num(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}
function int(v, def, min, max) {
  return Math.round(num(v, def, min, max));
}
function bool(v, def) {
  return typeof v === "boolean" ? v : def;
}
function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

const CATEGORY_RE = /^[a-z_]{2,40}$/;

/** Full, clamped rule object from any partial input (missing parts take the defaults). */
function normalizeRules(input = {}) {
  const d = DEFAULT_RULES;
  const w = input.weights || {};
  const rarity = {};
  for (const r of RARITIES) rarity[r] = num(w.rarity?.[r], d.weights.rarity[r], 0, 10);
  const category = {};
  for (const [k, v] of Object.entries(w.category || {})) if (CATEGORY_RE.test(k)) category[k] = num(v, 1, 0, 10);
  const bandsIn = Array.isArray(input.bands) && input.bands.length === 4 ? input.bands : d.bands;
  const bands = bandsIn.map((b, i) => {
    const min = int(b?.min, d.bands[i].min, 0, 100_000);
    const max = int(b?.max, d.bands[i].max, 0, 100_000);
    return { slot: i + 1, min: Math.min(min, max), max: Math.max(min, max) };
  });
  const t = input.toggles || {};
  const excl = Array.isArray(t.excludeCategories) ? t.excludeCategories.filter((c) => CATEGORY_RE.test(String(c))).slice(0, 20) : d.toggles.excludeCategories;
  return {
    weights: {
      rarity,
      category,
      freshnessPerDay: num(w.freshnessPerDay, d.weights.freshnessPerDay, 0, 1),
      freshnessCapDays: int(w.freshnessCapDays, d.weights.freshnessCapDays, 0, 365),
      newItemBoost: num(w.newItemBoost, d.weights.newItemBoost, 0, 10),
      newItemDays: int(w.newItemDays, d.weights.newItemDays, 0, 365),
      wishlistBoost: num(w.wishlistBoost, d.weights.wishlistBoost, 0, 20),
      setAffinityBoost: num(w.setAffinityBoost, d.weights.setAffinityBoost, 0, 10),
      sameCategoryPenalty: num(w.sameCategoryPenalty, d.weights.sameCategoryPenalty, 0, 1),
    },
    bands,
    toggles: {
      epicFloor: bool(t.epicFloor, d.toggles.epicFloor),
      noRepeatDays: int(t.noRepeatDays, d.toggles.noRepeatDays, 0, 60),
      includeSetPieces: bool(t.includeSetPieces, d.toggles.includeSetPieces),
      wishlistBoost: bool(t.wishlistBoost, d.toggles.wishlistBoost),
      diverseCategories: bool(t.diverseCategories, d.toggles.diverseCategories),
      newAccountDays: int(t.newAccountDays, d.toggles.newAccountDays, 0, 90),
      newAccountMaxPrice: int(t.newAccountMaxPrice, d.toggles.newAccountMaxPrice, 0, 100_000),
      lockEnabled: bool(t.lockEnabled, d.toggles.lockEnabled),
      excludeCategories: excl,
    },
  };
}

function normalizeLimits(input = {}) {
  const d = DEFAULT_LIMITS;
  const r = input.refresh || {};
  const g = input.gifts || {};
  const p = input.purchases || {};
  const n = input.nightMarket || {};
  const discountMin = int(n.discountMin, d.nightMarket.discountMin, 5, 90);
  const discountMax = int(n.discountMax, d.nightMarket.discountMax, 5, 90);
  const setMin = int(p.setDiscountMin, d.purchases.setDiscountMin, 5, 60);
  const setMax = int(p.setDiscountMax, d.purchases.setDiscountMax, 5, 60);
  const weekdays = Array.isArray(n.weekdays)
    ? [...new Set(n.weekdays.map((x) => int(x, -1, -1, 6)).filter((x) => x >= 0))].sort()
    : d.nightMarket.weekdays.slice();
  return {
    refresh: {
      price: int(r.price, d.refresh.price, 0, 100_000),
      perDay: int(r.perDay, d.refresh.perDay, 0, 10),
      premiumFree: bool(r.premiumFree, d.refresh.premiumFree),
      streakDays: int(r.streakDays, d.refresh.streakDays, 0, 60),
    },
    gifts: {
      enabled: bool(g.enabled, d.gifts.enabled),
      frozen: bool(g.frozen, d.gifts.frozen),
      perDay: int(g.perDay, d.gifts.perDay, 0, 100),
      perRecipientDay: int(g.perRecipientDay, d.gifts.perRecipientDay, 0, 100),
      receivePerDay: int(g.receivePerDay, d.gifts.receivePerDay, 0, 100),
      minAccountDaysSend: int(g.minAccountDaysSend, d.gifts.minAccountDaysSend, 0, 365),
      minAccountDaysSetBuy: int(g.minAccountDaysSetBuy, d.gifts.minAccountDaysSetBuy, 0, 365),
      maxMessage: int(g.maxMessage, d.gifts.maxMessage, 0, 500),
      maxScheduleDays: int(g.maxScheduleDays, d.gifts.maxScheduleDays, 0, 365),
      ringDetection: bool(g.ringDetection, d.gifts.ringDetection),
      ringWindowDays: int(g.ringWindowDays, d.gifts.ringWindowDays, 1, 90),
    },
    purchases: {
      refundMinutes: int(p.refundMinutes, d.purchases.refundMinutes, 0, 120),
      partialLockDays: int(p.partialLockDays, d.purchases.partialLockDays, 0, 60),
      setDiscountMin: Math.min(setMin, setMax),
      setDiscountMax: Math.max(setMin, setMax),
      actionUndoMinutes: int(p.actionUndoMinutes, d.purchases.actionUndoMinutes, 0, 120),
    },
    nightMarket: {
      enabled: bool(n.enabled, d.nightMarket.enabled),
      weekdays,
      startHour: int(n.startHour, d.nightMarket.startHour, 0, 23),
      durationHours: int(n.durationHours, d.nightMarket.durationHours, 1, 12),
      cards: int(n.cards, d.nightMarket.cards, 1, 12),
      flips: int(n.flips, d.nightMarket.flips, 1, 12),
      keepMax: int(n.keepMax, d.nightMarket.keepMax, 0, 12),
      discountMin: Math.min(discountMin, discountMax),
      discountMax: Math.max(discountMin, discountMax),
      skew: num(n.skew, d.nightMarket.skew, 0.5, 6),
      coOpenBonus: int(n.coOpenBonus, d.nightMarket.coOpenBonus, 0, 5),
    },
  };
}

/** Leaf-by-leaf difference: [{ path: "weights.rarity.epic", from, to }]. */
function diff(a, b, prefix = "") {
  const out = [];
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of [...keys].sort()) {
    const path = prefix ? `${prefix}.${k}` : k;
    const x = a ? a[k] : undefined;
    const y = b ? b[k] : undefined;
    const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
    if (isObj(x) || isObj(y)) out.push(...diff(isObj(x) ? x : {}, isObj(y) ? y : {}, path));
    else if (JSON.stringify(x) !== JSON.stringify(y)) out.push({ path, from: x === undefined ? null : x, to: y === undefined ? null : y });
  }
  return out;
}

module.exports = { RARITIES, EPIC_PLUS, RARITY_RANK, DEFAULT_RULES, DEFAULT_LIMITS, normalizeRules, normalizeLimits, diff, clone };
