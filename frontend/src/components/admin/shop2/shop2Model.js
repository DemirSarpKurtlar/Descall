/**
 * Vitrin ve Setler (admin, Market 2.0): pure logic shared by the page, its dialogs and
 * the selftest. No React, no network. Owner pick: Draft A "Kontrol merkezi" + Draft B
 * "Yayın takvimi" (scratchpad shop2-drafts/admin).
 */

export const RARITIES = Object.freeze(["common", "rare", "epic", "legendary", "mythic"]);
export const RARITY_COLOR = Object.freeze({ common: "#c9ced9", rare: "#6f8dff", epic: "#b57bff", legendary: "#f2b84b", mythic: "#ff6b7d" });

/** The 9 pieces of a set, grouped like the builder (A2): profile (+ aura), name + badge, effect + chat, sound. */
export const SET_SLOTS = Object.freeze(["avatar_frame", "banner", "profile_aura", "profile_color", "profile_badge", "avatar_effect", "chat_bubble", "voice_tile", "join_sound"]);
export const SLOT_GROUPS = Object.freeze([
  ["profile", ["avatar_frame", "banner", "profile_aura"]],
  ["nameBadge", ["profile_color", "profile_badge"]],
  ["effectChat", ["avatar_effect", "chat_bubble"]],
  ["sound", ["voice_tile", "join_sound"]],
]);

/** Allowed set discount (A2 "%20–%30 izinli bant") and the target the suggestion aims for. */
export const DISCOUNT_BAND = Object.freeze({ min: 20, max: 30, target: 24 });
export const UNDO_MINUTES = 30;
export const LOCALE_COUNT = 7;
export const TZ = "Europe/Istanbul";

const DAY = 86400000;

/* ------------------------------------------------------------------ numbers */

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const round10 = (v) => Math.round(Number(v || 0) / 10) * 10;
export const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Percent with one decimal (8.1), or null. */
export function pct(part, whole) {
  const w = Number(whole);
  if (!(w > 0)) return null;
  return Math.round((Number(part || 0) / w) * 1000) / 10;
}

/* ------------------------------------------------------------------ time */

/** Istanbul is UTC+3 all year (no DST since 2016). */
const IST_OFFSET = 3 * 3600000;

/** "2026-11-15" in Istanbul for a timestamp. */
export function istDay(ms) {
  return new Date(Number(ms) + IST_OFFSET).toISOString().slice(0, 10);
}

/** Epoch ms of 00:00 Istanbul of a day key. */
export function istMidnight(dayKey) {
  return Date.parse(`${dayKey}T00:00:00.000Z`) - IST_OFFSET;
}

/** Next 00:00 Istanbul after `now` (the storefront reset). */
export function nextReset(now) {
  return istMidnight(istDay(now)) + DAY;
}

/** Day key `n` days after `dayKey`. */
export function addDays(dayKey, n) {
  return istDay(istMidnight(dayKey) + n * DAY + 3600000);
}

/** Weekday of a day key, 0 = Monday … 6 = Sunday. */
export function weekdayMon(dayKey) {
  return (new Date(`${dayKey}T12:00:00Z`).getUTCDay() + 6) % 7;
}

/** "07:42:18" (hours can exceed 24 for long waits). Negative = 00:00:00. */
export function clock(ms) {
  const s = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/** Short duration label for queues ("2g 05s", "3g 03s", "07:42:18") as a key + vars. */
export function waitLabel(ms) {
  const s = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  if (s >= 86400) return { key: "adminShop2.dur.dh", vars: { d: Math.floor(s / 86400), h: String(Math.floor((s % 86400) / 3600)).padStart(2, "0") } };
  return { key: "adminShop2.dur.clock", vars: { c: clock(s * 1000) } };
}

/** Seconds left in the 30-minute undo window (0 = closed). */
export function undoLeft(until, now) {
  const t = Date.parse(until || "");
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((t - now) / 1000));
}

/** "28:14" for a seconds counter. */
export function mmss(sec) {
  const s = Math.max(0, Math.floor(Number(sec || 0)));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ algorithm weights */

/** Weights → whole percentages that add up to 100 (largest remainder). */
export function normalizeWeights(w) {
  const raw = RARITIES.map((r) => Math.max(0, num(w?.[r])));
  const sum = raw.reduce((a, b) => a + b, 0);
  if (!sum) return Object.fromEntries(RARITIES.map((r, i) => [r, i === 0 ? 100 : 0]));
  const exact = raw.map((v) => (v / sum) * 100);
  const floor = exact.map(Math.floor);
  let left = 100 - floor.reduce((a, b) => a + b, 0);
  const order = exact.map((v, i) => [v - floor[i], i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    floor[i] += 1;
    left -= 1;
  }
  return Object.fromEntries(RARITIES.map((r, i) => [r, floor[i]]));
}

/**
 * Move one rarity to `value` and take / give the difference from the others in
 * proportion, so the bar always stays at 100 (A1 slider + colour strip).
 */
export function setWeight(weights, rarity, value) {
  const cur = normalizeWeights(weights);
  const v = clamp(Math.round(num(value)), 0, 100);
  const others = RARITIES.filter((r) => r !== rarity);
  const rest = others.reduce((a, r) => a + cur[r], 0);
  const out = { [rarity]: v };
  const target = 100 - v;
  if (rest <= 0) others.forEach((r, i) => (out[r] = i === 0 ? target : 0));
  else others.forEach((r) => (out[r] = (cur[r] / rest) * target));
  return normalizeWeights(out);
}

/** Per-rarity change of the draft against the live rules (+4 → "+4"). */
export function weightDiff(draft, live) {
  const a = normalizeWeights(draft);
  const b = normalizeWeights(live);
  return Object.fromEntries(RARITIES.map((r) => [r, a[r] - b[r]]));
}

/** Number of fields that differ between two rule sets (the "3 değişiklik" badge). */
export function ruleChanges(draft, live) {
  if (!draft || !live) return 0;
  let n = 0;
  const d = weightDiff(draft.weights, live.weights);
  n += RARITIES.filter((r) => d[r] !== 0).length;
  const bd = draft.bands || [];
  const bl = live.bands || [];
  for (let i = 0; i < Math.max(bd.length, bl.length); i += 1) if (String(bd[i]) !== String(bl[i])) n += 1;
  const keys = new Set([...Object.keys(draft.toggles || {}), ...Object.keys(live.toggles || {})]);
  for (const k of keys) if (String(draft.toggles?.[k]) !== String(live.toggles?.[k])) n += 1;
  return n;
}

/** Donut arcs (B1 "642 havuz"): [{ rarity, from, to }] in 0..1. */
export function donutArcs(weights) {
  const w = normalizeWeights(weights);
  let at = 0;
  return RARITIES.map((r) => {
    const from = at;
    at += w[r] / 100;
    return { rarity: r, from, to: at };
  }).filter((a) => a.to > a.from);
}

/** SVG arc path for a donut segment (cx, cy, r, from/to in 0..1, gap in turns). */
export function arcPath(cx, cy, r, from, to, gap = 0.006) {
  const a0 = (from + gap) * 2 * Math.PI - Math.PI / 2;
  const a1 = Math.max(from + gap, to - gap) * 2 * Math.PI - Math.PI / 2;
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** Slot price bands: four ascending [min, max|null] pairs, each min >= the previous min. */
export function validBands(bands) {
  if (!Array.isArray(bands) || bands.length !== 4) return false;
  let prev = -1;
  for (const b of bands) {
    if (!Array.isArray(b)) return false;
    const [lo, hi] = b;
    if (!(lo >= 0) || lo < prev) return false;
    if (hi != null && !(hi > lo)) return false;
    prev = lo;
  }
  return true;
}

/* ------------------------------------------------------------------ set pricing */

export function itemPrice(item) {
  return Math.max(0, num(item?.price_descoin ?? item?.price));
}

/**
 * Set price facts (A2 price block + ladder): sum of pieces, most expensive single item,
 * discount, whether it is in the 20–30 band, how many times the dearest single item.
 */
export function setPricing(pieces, setPrice) {
  const list = (pieces || []).filter(Boolean);
  const sum = list.reduce((a, it) => a + itemPrice(it), 0);
  const maxSingle = list.reduce((a, it) => Math.max(a, itemPrice(it)), 0);
  const price = Math.max(0, num(setPrice));
  const discountPct = sum > 0 && price > 0 ? Math.round((1 - price / sum) * 1000) / 10 : 0;
  return {
    sum,
    maxSingle,
    price,
    discountPct,
    inBand: discountPct >= DISCOUNT_BAND.min && discountPct <= DISCOUNT_BAND.max,
    timesMax: maxSingle > 0 ? Math.round((price / maxSingle) * 10) / 10 : 0,
  };
}

/** Suggested set price at a discount, rounded to 10 (18.400 at %24 → 13.980). */
export function suggestedPrice(sum, discount = DISCOUNT_BAND.target) {
  return round10(num(sum) * (1 - discount / 100));
}

/** Price for a discount percent (the A2 slider), rounded to 10. */
export function priceAtDiscount(sum, discount) {
  return round10(num(sum) * (1 - clamp(num(discount), 0, 95) / 100));
}

/** The slider springs back into the allowed band when it is let go outside it (A2 motion 2). */
export function springDiscount(discount) {
  return clamp(Math.round(num(discount)), DISCOUNT_BAND.min, DISCOUNT_BAND.max);
}

/**
 * What one person pays: the set price minus the share of the pieces they own (owned
 * pieces are never charged twice). Owning every piece hides the set (null).
 */
export function priceForOwner(pieces, setPrice, ownedIds) {
  const list = (pieces || []).filter(Boolean);
  const owned = new Set((ownedIds || []).map(String));
  const { sum, price } = setPricing(list, setPrice);
  if (!list.length) return { price: 0, owned: 0, hidden: false };
  const ownedList = list.filter((it) => owned.has(String(it.id)));
  if (ownedList.length >= list.length) return { price: null, owned: ownedList.length, hidden: true };
  const ownedSum = ownedList.reduce((a, it) => a + itemPrice(it), 0);
  const p = sum > 0 ? round10(price * (1 - ownedSum / sum)) : price;
  return { price: p, owned: ownedList.length, hidden: false, saving: sum - ownedSum - p };
}

/**
 * "Kime ne fiyat" tiers (A2): none / 1–2 / 3+ / all. Each tier's price assumes the
 * cheapest pieces are the owned ones (the most common case: cheap pieces sell first),
 * `share` comes from the server's ownership counts when present.
 */
export function priceTiers(pieces, setPrice, shares = {}) {
  const list = (pieces || []).filter(Boolean);
  const byPrice = [...list].sort((a, b) => itemPrice(a) - itemPrice(b));
  const idsOf = (n) => byPrice.slice(0, n).map((it) => it.id);
  const mid = (lo, hi) => {
    const a = priceForOwner(list, setPrice, idsOf(lo)).price;
    const b = priceForOwner(list, setPrice, idsOf(hi)).price;
    return round10(((a ?? 0) + (b ?? 0)) / 2);
  };
  const three = list.length > 3 ? priceForOwner(list, setPrice, idsOf(3)).price : null;
  return [
    { key: "none", price: priceForOwner(list, setPrice, []).price, share: shares.none ?? null },
    { key: "few", price: list.length >= 2 ? mid(1, 2) : null, share: shares.few ?? null },
    { key: "many", price: three, share: shares.many ?? null },
    { key: "all", price: null, hidden: true, share: shares.all ?? null },
  ];
}

/**
 * Sales forecast (A2 "Tahmin"): first-day range and days to sell out, from the
 * conversion of comparable sets (server) scaled by how deep the discount is.
 */
export function forecast({ stock, discountPct, audience = 9000, baseConversion = 1.6 }) {
  const boost = 1 + (clamp(num(discountPct), 0, 40) - DISCOUNT_BAND.target) * 0.03;
  const mid = Math.max(1, (num(audience) * num(baseConversion) * boost) / 100);
  const lo = Math.max(1, Math.round((mid * 0.85) / 10) * 10);
  const hi = Math.max(lo, Math.round((mid * 1.15) / 10) * 10);
  const s = num(stock);
  const days = s > 0 ? Math.max(1, Math.ceil(s / ((lo + hi) / 2) + 0.5 * Math.log2(1 + s / mid))) : null;
  return { firstDayLo: lo, firstDayHi: hi, soldOutDays: days };
}

/* ------------------------------------------------------------------ palette match */

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toLab([r, g, b]) {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

function deltaE(a, b) {
  const p = toLab(a);
  const q = toLab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** Colours of an item: `palette` / `colors` fields, else hexes inside its SVG data URL. */
export function itemColors(item) {
  const own = item?.palette || item?.colors;
  if (Array.isArray(own) && own.length) return own.filter((c) => hexToRgb(c));
  const src = `${item?.asset_url || ""} ${item?.preview_url || ""}`;
  let text = src;
  try {
    text = decodeURIComponent(src);
  } catch {
    /* keep raw */
  }
  const found = [...text.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)].map((m) => `#${m[1].toLowerCase()}`);
  return [...new Set(found)].slice(0, 12);
}

/**
 * Palette match score 0..100 (B2 rack "96", A2 "Uyanları öner"): for each item colour the
 * distance to the nearest palette colour (CIE76), averaged; vivid colours count more
 * than near-black backgrounds so a dark SVG base does not decide the score.
 */
export function paletteScore(colors, palette) {
  const pal = (palette || []).map(hexToRgb).filter(Boolean);
  const cols = (colors || []).map(hexToRgb).filter(Boolean);
  if (!pal.length || !cols.length) return null;
  let wsum = 0;
  let acc = 0;
  for (const c of cols) {
    const d = Math.min(...pal.map((p) => deltaE(c, p)));
    const lab = toLab(c);
    const w = 0.35 + Math.min(1, Math.hypot(lab[1], lab[2]) / 60) + lab[0] / 200;
    acc += w * d;
    wsum += w;
  }
  const avg = acc / wsum;
  return clamp(Math.round(100 - avg * 1.15), 0, 100);
}

/** Score of an item against a set: a piece made for that set scores at least 90. */
export function itemPaletteScore(item, palette, setKey) {
  const s = paletteScore(itemColors(item), palette);
  if (setKey && item?.set_key === setKey) return Math.max(90, s ?? 90);
  return s ?? (Number.isFinite(item?.serverScore) ? Math.round(item.serverScore) : null);
}

/* ------------------------------------------------------------------ pre-publish checklist */

/**
 * A2 "Yayın öncesi denetim": nine pieces in one palette, discount in band, phone crop
 * checked, no clash in the first two days, pieces also sold one by one, 7/7 locales.
 */
export function checklist(set, { clashes = [], phoneChecked = false, palette = null } = {}) {
  const pieces = SET_SLOTS.map((s) => set?.pieces?.[s]).filter(Boolean);
  const pal = palette || set?.palette || [];
  const scores = pieces.map((p) => itemPaletteScore(p, pal, set?.key)).filter((v) => v != null);
  const low = scores.filter((v) => v < 60).length;
  const pr = setPricing(pieces, set?.price);
  const tr = num(set?.translations?.ready, 0);
  const rows = [
    { key: "pieces", ok: pieces.length === SET_SLOTS.length && low === 0, vars: { n: pieces.length, total: SET_SLOTS.length, low } },
    { key: "band", ok: pr.inBand, vars: { pct: pr.discountPct } },
    { key: "phone", ok: Boolean(phoneChecked) },
    { key: "clash", ok: !clashes.length, vars: { n: clashes.length } },
    { key: "single", ok: set?.partialSale !== false },
    { key: "locales", ok: tr >= LOCALE_COUNT, warn: tr < LOCALE_COUNT, vars: { n: tr, total: LOCALE_COUNT } },
  ];
  return { rows, ready: rows.filter((r) => r.ok).length, total: rows.length, canPublish: rows.every((r) => r.ok || r.key === "locales" || r.key === "phone") };
}

/* ------------------------------------------------------------------ lifecycle */

/** B2 "Yaşam döngüsü": upcoming | live | last24 | soldout | recalled | ended | draft. */
export function lifecycle(set, now) {
  if (!set) return "draft";
  if (set.status === "recalled" || set.state === "recalled") return "recalled";
  if (set.status === "draft" || set.state === "draft") return "draft";
  if (set.status === "archived" || set.state === "archived" || set.status === "ended") return "ended";
  const start = Date.parse(set.startsAt || "");
  const end = Date.parse(set.endsAt || "");
  if (Number.isFinite(start) && start > now) return "upcoming";
  const left = set.stock?.left;
  if (set.stock?.total != null && left != null && left <= 0) return "soldout";
  if (Number.isFinite(end) && end <= now) return "ended";
  if (Number.isFinite(end) && end - now <= DAY) return "last24";
  return "live";
}

export const STATUS_TONE = Object.freeze({ live: "green", last24: "red", upcoming: "blue", scheduled: "blue", draft: "gray", recalled: "red", soldout: "violet", ended: "violet" });

/** Table filter of the sets card (A1): all | live | scheduled | archive. */
export function filterSets(sets, filter, now) {
  const list = sets || [];
  if (filter === "live") return list.filter((s) => ["live", "last24"].includes(lifecycle(s, now)));
  if (filter === "scheduled") return list.filter((s) => lifecycle(s, now) === "upcoming");
  if (filter === "archive") return list.filter((s) => ["recalled", "ended", "soldout"].includes(lifecycle(s, now)));
  return list;
}

export function setCounts(sets, now) {
  const c = { live: 0, scheduled: 0, draft: 0, archive: 0 };
  for (const s of sets || []) {
    const l = lifecycle(s, now);
    if (l === "live" || l === "last24") c.live += 1;
    else if (l === "upcoming") c.scheduled += 1;
    else if (l === "draft") c.draft += 1;
    else c.archive += 1;
  }
  return c;
}

/** Days / hours / minutes until an ISO time, as key + vars ("2 gün 14 saat kaldı"). */
export function leftParts(iso, now) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return null;
  const s = Math.max(0, Math.floor((t - now) / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60) };
}

/* ------------------------------------------------------------------ timeline (B1) */

/** 14 day keys starting at `from`. */
export function dayRange(from, days = 14) {
  return Array.from({ length: days }, (_, i) => addDays(from, i));
}

/** Monday of this week (the two-week view starts there, like the draft 9–22 Kasım around Paz 15). */
export function timelineStart(now) {
  const today = istDay(now);
  return addDays(today, -weekdayMon(today));
}

/** Fractional day position of an ISO time inside a window (0 = start of the first day). */
export function dayPos(iso, from) {
  const t = typeof iso === "number" ? iso : Date.parse(iso || "");
  if (!Number.isFinite(t)) return null;
  return (t - istMidnight(from)) / DAY;
}

/**
 * Set bars with lanes (greedy interval packing). Bars outside the window are dropped,
 * open-ended sets run to the edge. → [{ set, x0, x1, lane, cutL, cutR }]
 */
export function setBars(sets, from, days = 14, now = Date.now()) {
  const out = [];
  const laneEnds = [];
  const items = (sets || [])
    .filter((s) => s.status !== "draft" || s.startsAt)
    .map((s) => {
      const a = dayPos(s.startsAt || now, from);
      const endIso = s.recalledAt || s.soldOutAt || s.endsAt;
      const b = endIso ? dayPos(endIso, from) : days;
      return { s, a: a ?? 0, b: b ?? days };
    })
    .filter(({ a, b }) => b > 0 && a < days)
    .sort((p, q) => p.a - q.a || q.b - p.b);
  for (const { s, a, b } of items) {
    const x0 = Math.max(0, a);
    const x1 = Math.min(days, Math.max(b, a + 0.35));
    let lane = laneEnds.findIndex((end) => end <= x0 + 0.02);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(x1);
    } else laneEnds[lane] = x1;
    out.push({ set: s, x0, x1, lane, cutL: a < 0, cutR: b > days });
  }
  return out;
}

/**
 * Clash warnings (B1, B2): a day where two sets open, where three or more sets are on
 * sale at once, or where the launches of the day add up to four or more legendary+
 * pieces. → [{ day, kind: "sameDay"|"crowded"|"legendary", keys }]
 */
export function findClashes(sets, from, days = 14) {
  const out = [];
  const list = (sets || []).filter((s) => s.status !== "draft" && s.status !== "recalled" && s.startsAt);
  for (const day of dayRange(from, days)) {
    const d0 = istMidnight(day);
    const d1 = d0 + DAY;
    const opening = list.filter((s) => istDay(Date.parse(s.startsAt)) === day);
    const live = list.filter((s) => {
      const a = Date.parse(s.startsAt);
      const b = Date.parse(s.recalledAt || s.soldOutAt || s.endsAt || "") || Infinity;
      return a < d1 && b > d0;
    });
    if (opening.length >= 2) out.push({ day, kind: "sameDay", keys: opening.map((s) => s.key) });
    else if (live.length >= 3 && opening.length) out.push({ day, kind: "crowded", keys: live.map((s) => s.key) });
    const legendary = opening.reduce((a, s) => a + SET_SLOTS.filter((k) => ["legendary", "mythic"].includes(s.pieces?.[k]?.rarity)).length, 0);
    if (legendary >= 4 && opening.length >= 2) out.push({ day, kind: "legendary", keys: opening.map((s) => s.key) });
  }
  return out;
}

/**
 * Clashes for one set being planned (B2): sets on sale during its first two days.
 * Returns the other sets and the first later day with at most one other live set.
 */
export function launchClash(set, others, { from = null, horizon = 21 } = {}) {
  const start = Date.parse(set?.startsAt || "");
  if (!Number.isFinite(start)) return { with: [], suggest: null };
  const live = (others || []).filter((s) => s.key !== set.key && s.status !== "draft" && s.status !== "recalled" && s.startsAt);
  const overlap = (t0) =>
    live.filter((s) => {
      const a = Date.parse(s.startsAt);
      const b = Date.parse(s.recalledAt || s.soldOutAt || s.endsAt || "") || Infinity;
      return a < t0 + 2 * DAY && b > t0;
    });
  const hit = overlap(start);
  if (hit.length < 2) return { with: [], suggest: null };
  let suggest = null;
  const timeOfDay = start - istMidnight(istDay(start));
  const base = from || istDay(start);
  for (let i = 1; i <= horizon; i += 1) {
    const day = addDays(istDay(start), i);
    if (day < base) continue;
    const t = istMidnight(day) + timeOfDay;
    if (overlap(t).length <= 1) {
      suggest = day;
      break;
    }
  }
  return { with: hit, suggest };
}

/** Same time of day on another day (B2 "20 Kas'a kaydır"). */
export function moveToDay(iso, dayKey) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return null;
  const tod = t - istMidnight(istDay(t));
  return new Date(istMidnight(dayKey) + tod).toISOString();
}

/* ------------------------------------------------------------------ charts */

export function niceMax(values) {
  const m = Math.max(0, ...(values || []).filter((v) => Number.isFinite(v)));
  if (!m) return 10;
  const exp = 10 ** Math.floor(Math.log10(m));
  for (const step of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (step * exp >= m) return step * exp;
  return 10 * exp;
}

/** Line path over a fixed number of slots (nulls end the line: the future). */
export function linePath(values, w, h, max, slots = values.length) {
  const n = Math.max(2, slots);
  let d = "";
  let pen = false;
  (values || []).forEach((v, i) => {
    if (!Number.isFinite(v)) {
      pen = false;
      return;
    }
    const x = (i / (n - 1)) * w;
    const y = h - (Math.max(0, v) / (max || 1)) * h;
    d += `${pen ? " L" : d ? " M" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    pen = true;
  });
  return d;
}

/** Closed area under the first continuous run of a line. */
export function areaPath(values, w, h, max, slots = values.length) {
  const n = Math.max(2, slots);
  const pts = [];
  for (let i = 0; i < (values || []).length; i += 1) {
    const v = values[i];
    if (!Number.isFinite(v)) {
      if (pts.length) break;
      continue;
    }
    pts.push([(i / (n - 1)) * w, h - (Math.max(0, v) / (max || 1)) * h]);
  }
  if (pts.length < 2) return "";
  return `M${pts[0][0].toFixed(1)} ${h} ${pts.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")} L${pts[pts.length - 1][0].toFixed(1)} ${h} Z`;
}

/** Index of the last finite value (the "now" dot). */
export function lastIndex(values) {
  for (let i = (values || []).length - 1; i >= 0; i -= 1) if (Number.isFinite(values[i])) return i;
  return -1;
}

export function sparkPath(values, w = 72, h = 22) {
  const vals = (values || []).filter((v) => Number.isFinite(v));
  if (vals.length < 2) return "";
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  return vals
    .map((v, i) => `${i ? "L" : "M"}${((i / (vals.length - 1)) * w).toFixed(1)} ${(hi === lo ? h / 2 : h - 2 - ((v - lo) / span) * (h - 4)).toFixed(1)}`)
    .join(" ");
}

/** Trend tone of a series: last third against the first third. */
export function trend(values) {
  const v = (values || []).filter((x) => Number.isFinite(x));
  if (v.length < 3) return "flat";
  const k = Math.max(1, Math.floor(v.length / 3));
  const a = v.slice(0, k).reduce((s, x) => s + x, 0) / k;
  const b = v.slice(-k).reduce((s, x) => s + x, 0) / k;
  if (b > a * 1.05) return "up";
  if (b < a * 0.95) return "down";
  return "flat";
}

/* ------------------------------------------------------------------ night market (B3) */

/** Open hours of a window that may cross midnight ("22:00"–"02:00" → 4). */
export function nightHours(from, to) {
  const p = (s) => {
    const [h, m] = String(s || "0:0").split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  let d = p(to) - p(from);
  if (d <= 0) d += 24 * 60;
  return Math.round((d / 60) * 10) / 10;
}

/**
 * Discount distribution bars (B3): weights for 5%-wide buckets between min and max,
 * peaked near the low end so high discounts are rare. → [{ from, weight }] + mean.
 */
export function discountBuckets(min, max, count = 13) {
  const lo = clamp(num(min), 0, 95);
  const hi = clamp(Math.max(num(max), lo + 5), 5, 100);
  const out = [];
  const peak = lo + (hi - lo) * 0.3;
  let wsum = 0;
  let mean = 0;
  for (let i = 0; i < count; i += 1) {
    const from = i * 5 + 10;
    const inside = from >= lo && from <= hi;
    const w = inside ? Math.exp(-(((from - peak) / ((hi - lo) / 2.2 || 1)) ** 2)) : 0;
    out.push({ from, weight: Math.round(w * 100) / 100, inside });
    wsum += w;
    mean += w * from;
  }
  return { buckets: out, mean: wsum ? Math.round(mean / wsum) : lo };
}

/** Night dates of a month for a weekday rule (0 = Mon). */
export function nightsInMonth(year, month, weekdays) {
  const out = [];
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  for (let d = 1; d <= days; d += 1) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if ((weekdays || []).includes(weekdayMon(key))) out.push(key);
  }
  return out;
}

/** Month grid (Monday first) with leading blanks. */
export function monthGrid(year, month) {
  const first = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lead = weekdayMon(first);
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d += 1) cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  return cells;
}

/** Next night from a schedule (calendar weekdays or explicit dates) at `openFrom`. */
export function nextNight(schedule, now) {
  const today = istDay(now);
  const [h, m] = String(schedule?.openFrom || "22:00").split(":").map(Number);
  const tod = ((h || 0) * 60 + (m || 0)) * 60000;
  const dates = new Set(schedule?.dates || []);
  for (let i = 0; i < 60; i += 1) {
    const day = addDays(today, i);
    const on = schedule?.mode === "manual" ? false : dates.has(day) || (schedule?.mode !== "random" && (schedule?.weekdays || []).includes(weekdayMon(day)));
    const at = istMidnight(day) + tod;
    if (on && at > now) return new Date(at).toISOString();
  }
  return null;
}

/* ------------------------------------------------------------------ limits */

/** Draft limits against saved ones: changed field paths. */
export function changedPaths(a, b, prefix = "") {
  const out = [];
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    const x = a?.[k];
    const y = b?.[k];
    if (x && typeof x === "object" && !Array.isArray(x)) out.push(...changedPaths(x, y, `${prefix}${k}.`));
    else if (JSON.stringify(x) !== JSON.stringify(y)) out.push(`${prefix}${k}`);
  }
  return out;
}

/** Reason rule shared by every destructive dialog (server checks the same). */
export function reasonOk(text, min = 8) {
  return String(text || "").trim().length >= min;
}

/* ------------------------------------------------------------------ misc */

/** Localized name of a catalog row: `{ tr, en, … }` objects or plain strings. */
export function nameOf(item, locale = "tr") {
  const n = item?.name;
  if (n && typeof n === "object") return n[locale] || n.en || n.tr || Object.values(n)[0] || "";
  return String(n || item?.title || item?.sku || "");
}

/** Deterministic avatar tint for a handle. */
export function avatarTint(handle) {
  let h = 0;
  for (const c of String(handle || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hues = [18, 205, 265, 330, 150, 40, 190];
  const hue = hues[h % hues.length];
  return `linear-gradient(140deg, hsl(${hue} 80% 62%), hsl(${(hue + 30) % 360} 70% 46%))`;
}

/** Group audit entries into "today / yesterday / day" buckets by Istanbul day. */
export function groupByDay(entries) {
  const out = [];
  let cur = null;
  for (const e of entries || []) {
    const d = istDay(Date.parse(e.at));
    if (!cur || cur.day !== d) {
      cur = { day: d, rows: [] };
      out.push(cur);
    }
    cur.rows.push(e);
  }
  return out;
}
