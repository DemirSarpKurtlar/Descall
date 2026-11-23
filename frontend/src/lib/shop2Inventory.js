// Inventory "Stüdyo" (owner pick, draft A, 22 Nov 2026): pure rules behind the inventory
// screen. Slots, owned items per slot (new / gift / retired), filters, sort and search,
// trying items locally ("pending" changes that nobody sees until "Uygula"), the palette
// score, the random combo with locked slots, set progress, saved looks and the equip
// history. No React, no DOM: tested by shop2Logic.selftest.mjs.
import { SET_PIECE_ORDER, isShop2Item, paletteMatch, rarityOf, rarityRank, RARITIES } from "./shop2Logic.js";

/** The 9 slots of the rail (the 9 pieces of every set), keys 1-9. */
export const INV_SLOTS = SET_PIECE_ORDER;
/** Other wearable categories, listed under the 9 slots when the user owns one. */
export const INV_EXTRA = Object.freeze(["name_effect", "presence_flare", "typing_flare", "reaction_burst", "call_overlay", "theme", "countries", "profile_background"]);
export const INV_NEW_DAYS = 7;
export const INV_SORTS = Object.freeze(["new", "rarity", "name", "value"]);
export const INV_FILTERS = Object.freeze(["all", "new", "equipped", "gift"]);

const DAY = 86_400_000;
const arr = (v) => (Array.isArray(v) ? v : []);
const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const ms = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

/**
 * No longer sold (owners keep it, it can still be worn): old catalog rows that left the shop
 * and recalled s2 items. Same rule as lib/shopItemI18n.js isRetiredShopItem (kept here so this
 * module stays free of the i18n runtime). Flags are never old.
 */
export function isRetiredInv(item) {
  if (!item) return false;
  if (item.category === "countries") return false;
  if (isShop2Item(item)) return Boolean(item.retired_at || item.retired === true);
  if (item.retired === true || item.retired_at) return true;
  return item.active === false;
}

/**
 * Inventory rows (GET /api/shop/inventory: { itemId, item, acquiredVia, giftedBy, acquiredAt })
 * -> entries per category. Every owned row counts, country flags included.
 */
export function buildInventory(rows, { now = Date.now(), seen = null } = {}) {
  const entries = [];
  const byId = new Set();
  for (const row of arr(rows)) {
    const item = row?.item;
    if (!item || item.id == null || byId.has(String(item.id))) continue;
    byId.add(String(item.id));
    const at = ms(row.acquiredAt ?? row.acquired_at);
    const recent = at != null && now - at < INV_NEW_DAYS * DAY;
    const gift = (row.acquiredVia ?? row.acquired_via) === "gift";
    entries.push({
      id: String(item.id),
      item,
      category: item.category,
      acquiredAt: at,
      gift,
      giftedBy: row.giftedBy ?? row.gifted_by ?? null,
      recent,
      isNew: recent && !(seen && seen.has(String(item.id))),
      retired: isRetiredInv(item),
      value: Math.max(0, Number(item.price_descoin) || 0),
    });
  }
  const byCat = {};
  const retired = [];
  for (const e of entries) {
    if (e.retired) {
      retired.push(e);
      continue;
    }
    (byCat[e.category] ||= []).push(e);
  }
  const extras = INV_EXTRA.filter((c) => byCat[c]?.length);
  const others = Object.keys(byCat).filter((c) => !INV_SLOTS.includes(c) && !INV_EXTRA.includes(c));
  return {
    entries,
    byCat,
    retired,
    extras: [...extras, ...others],
    total: entries.length,
    newCount: entries.filter((e) => e.isNew).length,
    giftCount: entries.filter((e) => e.gift && e.recent).length,
    value: entries.reduce((s, e) => s + e.value, 0),
  };
}

// ---------------------------------------------------------------------------
// Pending changes ("Değişiklik denemede"): tried locally, applied with "Uygula".

/** What would be worn: the equipped look with the pending changes over it. */
export function effectiveLook(equipped = {}, pending = {}) {
  return { ...equipped, ...pending };
}

/** Pending changes that differ from what is worn, in slot order. */
export function pendingChanges(equipped = {}, pending = {}) {
  const order = (c) => {
    const i = INV_SLOTS.indexOf(c);
    if (i >= 0) return i;
    const j = INV_EXTRA.indexOf(c);
    return j >= 0 ? 20 + j : 99;
  };
  return Object.entries(pending || {})
    .filter(([c, id]) => String(equipped?.[c] ?? "") !== String(id ?? ""))
    .map(([category, to]) => ({ category, from: equipped?.[category] ?? null, to: to ?? null }))
    .sort((a, b) => order(a.category) - order(b.category));
}

/** Try `id` (null = take off) in a slot; trying what is worn drops the slot's change. */
export function setPending(pending, equipped, category, id) {
  const next = { ...(pending || {}) };
  if (String(equipped?.[category] ?? "") === String(id ?? "")) delete next[category];
  else next[category] = id ?? null;
  return next;
}

/** Several slots at once (a random combo, a saved look loaded for preview). */
export function mergePending(pending, equipped, look) {
  let next = { ...(pending || {}) };
  for (const [c, id] of Object.entries(look || {})) next = setPending(next, equipped, c, id);
  return next;
}

/** Drop pending changes whose item is no longer owned (a refund, a recalled gift). */
export function prunePending(pending, ownedIds) {
  const next = {};
  for (const [c, id] of Object.entries(pending || {})) if (id == null || ownedIds.has(String(id))) next[c] = id;
  return next;
}

// ---------------------------------------------------------------------------
// One slot's grid: counts, filter chips, search, sort.

export function slotCounts(entries, { equippedId = null } = {}) {
  const rarity = {};
  for (const r of RARITIES) rarity[r] = 0;
  let isNew = 0;
  let gift = 0;
  let equipped = 0;
  for (const e of arr(entries)) {
    rarity[rarityOf(e.item)] += 1;
    if (e.isNew) isNew += 1;
    if (e.gift) gift += 1;
    if (sameId(e.id, equippedId)) equipped += 1;
  }
  return { all: arr(entries).length, new: isNew, gift, equipped, rarity };
}

/**
 * filter: all | new | equipped | gift; rarity: null or a rarity id; set: null (all), "none"
 * (no set) or a set key; query: matched against the item name in the UI language (and the
 * set name); sort: new | rarity | name | value.
 */
export function filterSlotItems(entries, { filter = "all", rarity = null, set = null, query = "", sort = "new", equippedId = null, nameOf = (i) => String(i?.name || ""), setNameOf = () => "", locale = "tr" } = {}) {
  const q = String(query || "").trim().toLocaleLowerCase(locale);
  const out = arr(entries).filter((e) => {
    if (filter === "new" && !e.isNew) return false;
    if (filter === "gift" && !e.gift) return false;
    if (filter === "equipped" && !sameId(e.id, equippedId)) return false;
    if (rarity && rarityOf(e.item) !== rarity) return false;
    if (set === "none" && e.item.set_key) return false;
    if (set && set !== "none" && e.item.set_key !== set) return false;
    if (q) {
      const hay = `${nameOf(e.item)} ${e.item.set_key ? setNameOf(e.item.set_key) : ""}`.toLocaleLowerCase(locale);
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const byName = (a, b) => nameOf(a.item).localeCompare(nameOf(b.item), locale);
  const cmp = {
    new: (a, b) => (b.acquiredAt || 0) - (a.acquiredAt || 0) || byName(a, b),
    rarity: (a, b) => rarityRank(b.item) - rarityRank(a.item) || byName(a, b),
    name: byName,
    value: (a, b) => b.value - a.value || byName(a, b),
  }[INV_SORTS.includes(sort) ? sort : "new"];
  return out.sort(cmp);
}

/** Set keys found among a slot's items, for the "Set" menu. */
export function slotSets(entries) {
  const keys = [];
  let none = false;
  for (const e of arr(entries)) {
    const k = e.item.set_key;
    if (!k) none = true;
    else if (!keys.includes(k)) keys.push(k);
  }
  return { keys, none };
}

// ---------------------------------------------------------------------------
// Palette score ("Palet uyumu").

/** Colour of an item: its own, else its set's (the set's mid colour, as the item sheet uses). */
export function colorOfItem(item, setsByKey = {}) {
  if (!item) return null;
  if (typeof item.color === "string" && item.color) return item.color;
  if (arr(item.palette)[2]) return item.palette[2];
  const set = item.set_key ? setsByKey[item.set_key] : null;
  const p = arr(set?.palette);
  return p[2] || p[1] || p[0] || null;
}

/** The set most of the worn pieces come from (ties: the earlier slot), with its palette. */
export function dominantSet(lookItems, setsByKey = {}) {
  const count = new Map();
  for (const c of [...INV_SLOTS, ...INV_EXTRA]) {
    const k = lookItems?.[c]?.set_key;
    if (k && setsByKey[k]?.palette?.length) count.set(k, (count.get(k) || 0) + 1);
  }
  let best = null;
  for (const [k, n] of count) if (!best || n > best.n) best = { key: k, n };
  return best ? { key: best.key, palette: setsByKey[best.key].palette, pieces: best.n } : null;
}

/**
 * Score 0..100 of the worn colours against the dominant set palette, the slot that fits worst
 * (under 60) and the owned item that would fit best instead (with the score it would give).
 * lookItems: { category: item }; ownedByCat: { category: [item] }. null when nothing worn has
 * a set colour.
 */
export function paletteReport(lookItems, setsByKey = {}, ownedByCat = {}) {
  const dom = dominantSet(lookItems, setsByKey);
  if (!dom) return null;
  const worn = [];
  for (const c of INV_SLOTS) {
    const it = lookItems?.[c];
    const color = colorOfItem(it, setsByKey);
    if (it && color) worn.push({ category: c, item: it, color, fit: paletteMatch(dom.palette, [color]) ?? 100 });
  }
  if (!worn.length) return null;
  const score = paletteMatch(dom.palette, worn.map((w) => w.color)) ?? 0;
  const weakest = worn.reduce((a, w) => (!a || w.fit < a.fit ? w : a), null);
  const off = weakest && weakest.fit < 60 ? weakest : null;
  let suggestion = null;
  if (off) {
    for (const cand of arr(ownedByCat[off.category])) {
      if (sameId(cand.id, off.item.id)) continue;
      const color = colorOfItem(cand, setsByKey);
      if (!color) continue;
      const s = paletteMatch(dom.palette, worn.map((w) => (w.category === off.category ? color : w.color))) ?? 0;
      if (s > score && (!suggestion || s > suggestion.score)) suggestion = { category: off.category, item: cand, score: s };
    }
  }
  return {
    score,
    setKey: dom.key,
    palette: dom.palette,
    swatches: worn.map((w) => ({ category: w.category, color: w.color, off: Boolean(off) && w.category === off.category })),
    weakest: off ? { category: off.category, item: off.item } : null,
    suggestion,
  };
}

// ---------------------------------------------------------------------------
// Random combo ("Rastgele kombin", locked slots stay).

/** Small deterministic generator for tests and "Karıştır" seeds. */
export function seededRandom(seed = 1) {
  let x = (seed >>> 0) || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 100000) / 100000;
  };
}

/**
 * A combo from owned items for every unlocked slot that has one: an anchor set is picked
 * (weighted by owned pieces) and its pieces are preferred, so the result usually fits one
 * palette. Returns { category: itemId } for unlocked slots only; differs from `current` in
 * at least one slot when possible.
 */
export function randomCombo({ ownedByCat = {}, current = {}, locks = [], rng = Math.random, slots = INV_SLOTS } = {}) {
  const locked = new Set(arr(locks));
  const open = slots.filter((c) => !locked.has(c) && arr(ownedByCat[c]).length);
  if (!open.length) return {};
  const setCount = new Map();
  for (const c of open) for (const it of arr(ownedByCat[c])) if (it.set_key) setCount.set(it.set_key, (setCount.get(it.set_key) || 0) + 1);
  const pickSet = () => {
    const total = [...setCount.values()].reduce((s, n) => s + n, 0);
    if (!total) return null;
    let r = rng() * total;
    for (const [k, n] of setCount) {
      r -= n;
      if (r < 0) return k;
    }
    return [...setCount.keys()].pop();
  };
  let out = {};
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const anchor = pickSet();
    out = {};
    for (const c of open) {
      const list = arr(ownedByCat[c]);
      const inSet = anchor ? list.filter((it) => it.set_key === anchor) : [];
      const pool = inSet.length && rng() < 0.8 ? inSet : list;
      out[c] = String(pool[Math.floor(rng() * pool.length) % pool.length].id);
    }
    if (open.some((c) => String(current?.[c] ?? "") !== out[c])) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Set progress ("Set ilerlemesi").

/** Sets with at least one owned piece, most complete first (complete sets last). */
export function setProgressList(sets, { limit = 4 } = {}) {
  return arr(sets)
    .map((s) => {
      const total = Number(s.pieceCount) || arr(s.pieces).length || 9;
      const owned = Math.min(total, Number(s.ownedCount) || 0);
      return { key: s.key, name: s.name, palette: arr(s.palette), owned, total, left: total - owned, pct: total ? owned / total : 0 };
    })
    .filter((s) => s.owned > 0)
    .sort((a, b) => Number(a.left === 0) - Number(b.left === 0) || b.pct - a.pct || b.owned - a.owned)
    .slice(0, limit);
}

/**
 * "Gece Mercanı için 1 eksik: Resif Balonu · vitrinde 450 D": the first missing piece of an
 * open set (set page detail), at today's storefront price when it is in the storefront.
 */
export function missingPiece(setDetail, storefrontSlots = []) {
  const pieces = arr(setDetail?.pieces);
  const missing = pieces.filter((p) => !p.owned);
  if (!missing.length) return null;
  const inFront = missing.map((p) => ({ p, slot: arr(storefrontSlots).find((s) => sameId(s.item?.id, p.item.id)) })).find((x) => x.slot);
  const pick = inFront || { p: missing[0], slot: null };
  return {
    setKey: setDetail.key,
    left: missing.length,
    item: pick.p.item,
    price: pick.slot ? pick.slot.price : pick.p.priceNow ?? pick.p.item.price_descoin,
    inStorefront: Boolean(pick.slot),
  };
}

// ---------------------------------------------------------------------------
// Saved looks ("Kayıtlı görünümlerin").

/** Non-empty slots of a saved look. */
export function lookPieceCount(look) {
  return Object.values(look || {}).filter((v) => v != null && v !== "").length;
}

/** True when everything the saved look sets is what is worn now. */
export function lookMatches(look, equipped = {}) {
  const entries = Object.entries(look || {});
  if (!entries.some(([, v]) => v != null && v !== "")) return false;
  return entries.every(([c, id]) => String(equipped?.[c] ?? "") === String(id ?? ""));
}

/**
 * Saved looks in display order: only the newest automatic look ("Önceki görünüm"; the server
 * keeps 5, which showed it several times), pinned ones first when asked, newest first.
 */
export function arrangeLooks(outfits, { pinnedFirst = true } = {}) {
  const list = arr(outfits).map((o) => ({ ...o, look: o.look || o.items || {}, auto: o.auto || o.kind === "previous" }));
  const t = (o) => ms(o.createdAt ?? o.created_at) || 0;
  const autos = list.filter((o) => o.auto).sort((a, b) => t(b) - t(a));
  const saved = list.filter((o) => !o.auto).sort((a, b) => (pinnedFirst ? Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) : 0) || t(b) - t(a));
  return autos.length ? [...saved, autos[0]] : saved;
}

// ---------------------------------------------------------------------------
// Equip history ("Kuşanma geçmişi").

/** GET /api/shop2/equip-history -> { total, entries: [{ id, at, kind, source, changes }], items }. */
export function normalizeEquipHistory(raw) {
  const items = new Map();
  for (const [id, it] of Object.entries(raw?.items || {})) if (it) items.set(String(id), it);
  const entries = arr(raw?.entries).map((e) => ({
    id: e.id,
    at: ms(e.at),
    kind: e.kind || "look_apply",
    source: e.source || e.kind || "inventory",
    outfitName: e.outfitName || null,
    changes: arr(e.changes).map((c) => ({ category: c.category, from: c.from ?? null, to: c.to ?? null })).filter((c) => c.category),
    undone: Boolean(e.undoneAt),
  })).filter((e) => e.changes.length).sort((a, b) => (b.at || 0) - (a.at || 0));
  return { total: Number(raw?.total) || entries.length, entries, items };
}

/** Title of a history row: "slot" (one slot: "<Çerçeve> değişti"), "outfit", "set", "random", "revert", "look". */
export function historyKind(entry) {
  if (!entry) return "look";
  if (entry.kind === "outfit_apply") return "outfit";
  if (entry.kind === "equip") return "set";
  if (entry.source === "random") return "random";
  if (entry.source === "revert") return "revert";
  if (entry.source === "palette") return "palette";
  return entry.changes.length === 1 ? "slot" : "look";
}

/** "Geri dön": the before items of a history row that can still be worn (taken-off slots too). */
export function revertLook(entry, ownedIds) {
  const look = {};
  for (const c of arr(entry?.changes)) {
    if (c.from == null || ownedIds.has(String(c.from))) look[c.category] = c.from;
  }
  return look;
}

// ---------------------------------------------------------------------------
// Keyboard ("Yuvalar arasında 1-9", "/" search).

export function slotForKey(key, slots = INV_SLOTS) {
  if (!/^[1-9]$/.test(String(key))) return null;
  return slots[Number(key) - 1] || null;
}

/** True when a key press belongs to a text field (no shortcuts then). */
export function isTypingTarget(el) {
  if (!el) return false;
  const tag = String(el.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || Boolean(el.isContentEditable);
}

/** Age of a saved look / history row: { unit: "min"|"hour"|"day"|"week"|"month", n }. */
export function ageOf(at, now = Date.now()) {
  const t = ms(at);
  if (t == null) return null;
  const d = Math.max(0, now - t);
  if (d < 3_600_000) return { unit: "min", n: Math.max(1, Math.round(d / 60_000)) };
  if (d < DAY) return { unit: "hour", n: Math.round(d / 3_600_000) };
  if (d < 7 * DAY) return { unit: "day", n: Math.floor(d / DAY) };
  if (d < 30 * DAY) return { unit: "week", n: Math.floor(d / (7 * DAY)) };
  return { unit: "month", n: Math.floor(d / (30 * DAY)) };
}

// Seen ids for the "Yeni" badge (kept on the device; a slot's new items count as seen once
// the user leaves the slot).
const SEEN_KEY = "descall.shop2.invSeen";
export function readSeen() {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
    return new Set(Array.isArray(v) ? v.map(String) : []);
  } catch {
    return new Set();
  }
}
export function writeSeen(set) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-600)));
  } catch {
    /* private mode */
  }
}
