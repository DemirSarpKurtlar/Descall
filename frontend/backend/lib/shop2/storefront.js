"use strict";

/**
 * Personal daily storefront (pure). 4 cards per user per Istanbul day, one price band per slot,
 * never an owned / retired / inactive item, no repeats within `noRepeatDays`, at least one
 * epic-or-better card, and one locked card that survives a refresh. The result is a pure
 * function of (userId, day, ruleVersion, refreshCount, regen) + pool + user facts, so it can be
 * reproduced exactly for the admin "why" drawer.
 */

const { seedOf, rngFrom, weightedIndex } = require("./rng");
const { EPIC_PLUS, normalizeRules } = require("./rules");
const time = require("./time");

const SLOTS = 4;

function storefrontSeed({ userId, day, ruleVersion, refreshCount = 0, regen = 0 }) {
  return seedOf("shop2-storefront", userId, day, `v${ruleVersion}`, `r${refreshCount}`, `g${regen}`);
}

/** Why an item is not in the candidate pool, or null when it is eligible. */
function exclusionReason(item, ctx) {
  if (!item || !item.active || item.retired) return "retired";
  if (ctx.owned.has(String(item.id))) return "owned";
  if (ctx.rules.toggles.excludeCategories.includes(item.category)) return "category";
  if (!ctx.rules.toggles.includeSetPieces && item.setKey) return "set_piece";
  if ((ctx.rules.weights.rarity[item.rarity] ?? 0) <= 0) return "rarity_off";
  if ((ctx.rules.weights.category[item.category] ?? 1) <= 0) return "category_off";
  if (ctx.newAccount && Number(item.price) > ctx.rules.toggles.newAccountMaxPrice) return "new_account";
  return null;
}

function daysUnseen(itemId, ctx) {
  const last = ctx.lastShown.get(String(itemId));
  if (!last) return null;
  return Math.max(0, time.daysBetween(last, ctx.day));
}

function baseWeight(item, ctx) {
  const w = ctx.rules.weights;
  let weight = (w.rarity[item.rarity] ?? 0) * (w.category[item.category] ?? 1);
  const unseen = daysUnseen(item.id, ctx);
  const freshDays = unseen == null ? w.freshnessCapDays : Math.min(unseen, w.freshnessCapDays);
  weight *= 1 + freshDays * w.freshnessPerDay;
  const created = time.ms(item.createdAt);
  if (created != null && ctx.now - created <= w.newItemDays * time.DAY_MS) weight *= w.newItemBoost;
  if (ctx.rules.toggles.wishlistBoost && ctx.wishlist.has(String(item.id))) weight *= w.wishlistBoost;
  if (item.setKey && ctx.partialSets.has(item.setKey)) weight *= w.setAffinityBoost;
  return weight;
}

function reasonsFor(item, ctx, extra = []) {
  const out = [];
  const unseen = daysUnseen(item.id, ctx);
  out.push({ code: "rarity", rarity: item.rarity, weight: ctx.rules.weights.rarity[item.rarity] ?? 0 });
  out.push(unseen == null ? { code: "never_shown" } : { code: "unseen", days: unseen });
  const created = time.ms(item.createdAt);
  if (created != null && ctx.now - created <= ctx.rules.weights.newItemDays * time.DAY_MS) out.push({ code: "new_item" });
  if (ctx.wishlist.has(String(item.id))) out.push({ code: "wishlist" });
  if (item.setKey && ctx.partialSets.has(item.setKey)) out.push({ code: "set_progress", setKey: item.setKey });
  else if (item.setKey) out.push({ code: "set_piece", setKey: item.setKey });
  return [...extra, ...out];
}

/** English one-liner of the reasons (the UI builds its own localized text from `reasons`). */
function whyText(reasons) {
  const parts = [];
  for (const r of reasons) {
    if (r.code === "locked") parts.push("locked by the user");
    else if (r.code === "band") parts.push(`slot ${r.slot} price band ${r.min}-${r.max}`);
    else if (r.code === "band_relaxed") parts.push(`no item in band ${r.min}-${r.max}, band relaxed`);
    else if (r.code === "epic_floor") parts.push("epic floor: storefront needs one epic or better");
    else if (r.code === "rarity") parts.push(`${r.rarity} weight ${r.weight}`);
    else if (r.code === "never_shown") parts.push("never shown to this user");
    else if (r.code === "unseen") parts.push(`not seen for ${r.days} days`);
    else if (r.code === "new_item") parts.push("new item boost");
    else if (r.code === "wishlist") parts.push("on the wishlist");
    else if (r.code === "set_progress") parts.push(`completes a set the user started (${r.setKey})`);
    else if (r.code === "set_piece") parts.push(`piece of set ${r.setKey}`);
    else if (r.code === "repeat_relaxed") parts.push("pool too small, repeat rule relaxed");
    else if (r.code === "chance") parts.push(`${r.pct}% chance at pick`);
  }
  return parts.join(" · ");
}

/**
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.day                 Istanbul day key
 * @param {number} p.ruleVersion
 * @param {number} [p.refreshCount]
 * @param {number} [p.regen]             admin "regenerate" counter
 * @param {Array}  p.pool                [{ id, category, rarity, price, setKey, createdAt, active, retired }]
 * @param {Iterable} [p.owned]           owned item ids
 * @param {Map|object} [p.lastShown]     itemId -> day key it was last shown (earlier storefronts)
 * @param {Iterable} [p.shownToday]      ids shown earlier today (before this refresh)
 * @param {Iterable} [p.wishlist]
 * @param {Iterable} [p.partialSets]     set keys the user owns some (not all) pieces of
 * @param {{itemId, slot}} [p.lock]
 * @param {boolean} [p.newAccount]
 * @param {object} [p.rules]
 */
function generateStorefront(p) {
  const rules = normalizeRules(p.rules || {});
  const seed = storefrontSeed(p);
  const rng = rngFrom(seed);
  const lastShown = p.lastShown instanceof Map ? p.lastShown : new Map(Object.entries(p.lastShown || {}));
  const ctx = {
    rules,
    day: p.day,
    now: time.ms(p.now) ?? time.dayStartMs(p.day) + time.HOUR_MS,
    owned: new Set([...(p.owned || [])].map(String)),
    lastShown,
    wishlist: new Set([...(p.wishlist || [])].map(String)),
    partialSets: new Set(p.partialSets || []),
    newAccount: Boolean(p.newAccount),
  };
  const shownToday = new Set([...(p.shownToday || [])].map(String));
  const excluded = { owned: 0, retired: 0, repeat: 0, category: 0, set_piece: 0, rarity_off: 0, category_off: 0, new_account: 0 };
  const pool = [...(p.pool || [])].sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
  const byId = new Map(pool.map((it) => [String(it.id), it]));

  let eligible = [];
  for (const item of pool) {
    const why = exclusionReason(item, ctx);
    if (why) excluded[why] = (excluded[why] || 0) + 1;
    else eligible.push(item);
  }
  // No repeats: earlier refreshes today and anything shown in the last N days.
  const isRepeat = (item) => {
    const id = String(item.id);
    if (shownToday.has(id)) return true;
    const d = daysUnseen(id, ctx);
    return d != null && d < rules.toggles.noRepeatDays;
  };
  const fresh = eligible.filter((it) => !isRepeat(it));
  const relaxed = [];
  if (fresh.length >= SLOTS) {
    excluded.repeat = eligible.length - fresh.length;
    eligible = fresh;
  } else if (eligible.length > fresh.length) {
    relaxed.push("repeat");
  }

  const slots = new Array(SLOTS).fill(null);
  const taken = new Set();
  const lockId = p.lock && p.lock.itemId != null ? String(p.lock.itemId) : null;
  if (lockId && rules.toggles.lockEnabled) {
    const item = byId.get(lockId);
    if (item && !exclusionReason(item, ctx)) {
      const at = Math.min(SLOTS, Math.max(1, Number(p.lock.slot) || 1)) - 1;
      slots[at] = { slot: at + 1, item, locked: true, reasons: reasonsFor(item, ctx, [{ code: "locked" }]) };
      taken.add(lockId);
    }
  }

  const categoryCount = new Map();
  const bump = (item) => categoryCount.set(item.category, (categoryCount.get(item.category) || 0) + 1);
  for (const s of slots) if (s) bump(s.item);
  const weightOf = (item) => {
    let w = baseWeight(item, ctx);
    if (rules.toggles.diverseCategories) w *= rules.weights.sameCategoryPenalty ** (categoryCount.get(item.category) || 0);
    return w;
  };

  for (let i = 0; i < SLOTS; i += 1) {
    if (slots[i]) continue;
    const band = rules.bands[i];
    const remaining = eligible.filter((it) => !taken.has(String(it.id)));
    if (!remaining.length) break;
    let cands = remaining.filter((it) => Number(it.price) >= band.min && Number(it.price) <= band.max);
    const extra = [];
    if (cands.length) extra.push({ code: "band", slot: i + 1, min: band.min, max: band.max });
    else {
      cands = remaining;
      extra.push({ code: "band_relaxed", slot: i + 1, min: band.min, max: band.max });
    }
    const weights = cands.map(weightOf);
    let idx = weightedIndex(rng, weights);
    if (idx < 0) idx = Math.floor(rng() * cands.length);
    const total = weights.reduce((a, b) => a + b, 0);
    const item = cands[idx];
    const pct = total > 0 ? Math.round((weights[idx] / total) * 1000) / 10 : null;
    if (relaxed.includes("repeat") && isRepeat(item)) extra.push({ code: "repeat_relaxed" });
    slots[i] = { slot: i + 1, item, locked: false, reasons: reasonsFor(item, ctx, extra).concat(pct != null ? [{ code: "chance", pct }] : []) };
    taken.add(String(item.id));
    bump(item);
  }

  // Rarity floor: at least one epic+ card. Replace the highest unlocked slot.
  let floorApplied = false;
  if (rules.toggles.epicFloor && !slots.some((s) => s && EPIC_PLUS.has(s.item.rarity))) {
    const cands = eligible.filter((it) => EPIC_PLUS.has(it.rarity) && !taken.has(String(it.id)));
    if (cands.length) {
      const at = [3, 2, 1, 0].find((k) => slots[k] && !slots[k].locked);
      if (at != null) {
        const weights = cands.map((it) => baseWeight(it, ctx));
        let idx = weightedIndex(rng, weights);
        if (idx < 0) idx = 0;
        const item = cands[idx];
        taken.delete(String(slots[at].item.id));
        slots[at] = { slot: at + 1, item, locked: false, reasons: reasonsFor(item, ctx, [{ code: "epic_floor" }]) };
        taken.add(String(item.id));
        floorApplied = true;
      }
    }
  }

  const out = slots.filter(Boolean).map((s) => ({
    slot: s.slot,
    itemId: s.item.id,
    locked: s.locked,
    reasons: s.reasons,
    why: whyText(s.reasons),
  }));
  return {
    seed,
    day: p.day,
    ruleVersion: p.ruleVersion,
    refreshCount: p.refreshCount || 0,
    slots: out,
    excluded,
    poolSize: pool.length,
    eligible: eligible.length,
    relaxed,
    epicFloorApplied: floorApplied,
  };
}

module.exports = { SLOTS, storefrontSeed, generateStorefront, exclusionReason, whyText };
