"use strict";

/**
 * Admin "simulate": run a rule version over N synthetic users without saving anything, and
 * palette match scores for the set builder. Pure.
 */

const { generateStorefront } = require("./storefront");
const { seedOf, rngFrom } = require("./rng");
const { EPIC_PLUS, RARITIES } = require("./rules");

/**
 * @param {object} p { rules, pool, sample=10000, day, ruleVersion, baseline? (rules to compare) }
 * Synthetic users own 0-30 % of the pool (skewed low) and have seen nothing recently.
 */
async function simulate(p) {
  const sample = Math.min(20_000, Math.max(1, Math.round(Number(p.sample) || 10_000)));
  const pool = p.pool || [];
  const ids = pool.map((it) => String(it.id)).sort();
  const day = p.day;
  const run = async (rules) => {
    const rng = rngFrom(seedOf("shop2-sim", day, sample));
    const exposure = new Map(ids.map((id) => [id, 0]));
    const rarity = Object.fromEntries(RARITIES.map((r) => [r, 0]));
    const category = {};
    const slotPrice = [0, 0, 0, 0];
    const slotN = [0, 0, 0, 0];
    let floorForced = 0;
    let withEpic = 0;
    let empty = 0;
    let value = 0;
    const byId = new Map(pool.map((it) => [String(it.id), it]));
    for (let u = 0; u < sample; u += 1) {
      // Yield to the event loop: a 10k run must not freeze the API for everyone else.
      if (u && u % 250 === 0) await new Promise((r) => setImmediate(r));
      const ownRate = 0.3 * rng() ** 2;
      const owned = [];
      for (const id of ids) if (rng() < ownRate) owned.push(id);
      const sf = generateStorefront({ userId: `sim-${u}`, day, ruleVersion: p.ruleVersion || 0, pool, owned, rules });
      if (!sf.slots.length) empty += 1;
      if (sf.epicFloorApplied) floorForced += 1;
      let hasEpic = false;
      for (const s of sf.slots) {
        const it = byId.get(String(s.itemId));
        exposure.set(String(s.itemId), (exposure.get(String(s.itemId)) || 0) + 1);
        rarity[it.rarity] = (rarity[it.rarity] || 0) + 1;
        category[it.category] = (category[it.category] || 0) + 1;
        slotPrice[s.slot - 1] += Number(it.price) || 0;
        slotN[s.slot - 1] += 1;
        value += Number(it.price) || 0;
        if (EPIC_PLUS.has(it.rarity)) hasEpic = true;
      }
      if (hasEpic) withEpic += 1;
    }
    const cards = Object.values(rarity).reduce((a, b) => a + b, 0) || 1;
    const share = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, Math.round((v / cards) * 1000) / 10]));
    const exp = [...exposure.entries()].map(([id, n]) => ({ id, n, pct: Math.round((n / sample) * 10000) / 100 }));
    exp.sort((a, b) => b.n - a.n);
    return {
      sample,
      emptyStorefronts: empty,
      epicFloorForcedPct: Math.round((floorForced / sample) * 1000) / 10,
      withEpicPct: Math.round((withEpic / sample) * 1000) / 10,
      avgStorefrontValue: Math.round(value / sample),
      avgSlotPrice: slotPrice.map((v, i) => (slotN[i] ? Math.round(v / slotN[i]) : null)),
      rarityShare: share(rarity),
      categoryShare: share(category),
      neverShown: exp.filter((x) => x.n === 0).map((x) => x.id),
      neverShownCount: exp.filter((x) => x.n === 0).length,
      top: exp.slice(0, 10),
      bottom: exp.filter((x) => x.n > 0).slice(-10).reverse(),
      // Heatmap: exposure per item (the UI groups by category).
      heatmap: exp.map((x) => ({ id: x.id, category: byId.get(x.id)?.category || null, rarity: byId.get(x.id)?.rarity || null, pct: x.pct })),
    };
  };
  const result = await run(p.rules || {});
  if (p.baseline) {
    const base = await run(p.baseline);
    result.baseline = { avgStorefrontValue: base.avgStorefrontValue, withEpicPct: base.withEpicPct, rarityShare: base.rarityShare, neverShownCount: base.neverShownCount, avgSlotPrice: base.avgSlotPrice };
    result.delta = {
      avgStorefrontValue: result.avgStorefrontValue - base.avgStorefrontValue,
      withEpicPct: Math.round((result.withEpicPct - base.withEpicPct) * 10) / 10,
      neverShownCount: result.neverShownCount - base.neverShownCount,
    };
  }
  return result;
}

/* ---------- palette match ---------- */

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Perceptual-ish distance ("redmean"), 0 .. ~765. */
function colorDistance(a, b) {
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

/** Hex colours inside an SVG data URI / CSS string (first `max` distinct). */
function colorsIn(text, max = 8) {
  const s = String(text || "");
  let decoded = s;
  try {
    decoded = decodeURIComponent(s);
  } catch {
    /* keep raw */
  }
  const out = [];
  for (const m of decoded.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const hex = `#${m[1].toLowerCase()}`;
    if (!out.includes(hex)) out.push(hex);
    if (out.length >= max) break;
  }
  return out;
}

/** 0-100: how well `colors` cover `palette` (each palette colour finds its nearest item colour). */
function paletteScore(palette, colors) {
  const p = (palette || []).map(hexToRgb).filter(Boolean);
  const c = (colors || []).map(hexToRgb).filter(Boolean);
  if (!p.length || !c.length) return null;
  const MAX = 300;
  let total = 0;
  for (const pc of p) {
    const d = Math.min(...c.map((cc) => colorDistance(pc, cc)));
    total += Math.max(0, 1 - d / MAX);
  }
  return Math.round((total / p.length) * 100);
}

module.exports = { simulate, hexToRgb, colorDistance, colorsIn, paletteScore };
