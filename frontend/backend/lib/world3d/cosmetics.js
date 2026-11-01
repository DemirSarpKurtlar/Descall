"use strict";

/**
 * 3D world, phase 5: character cosmetics ("Karakterini oluştur", approved-ui-5.png).
 *
 * The catalog lives here and only here: ids, slot, price and the free flag. The client
 * shows prices it gets from GET /api/world3d/cosmetics and never sends a price the
 * server would trust; a purchase is priced from this list on the server.
 * The engine mirror (frontend/src/world3d/engine/look.js) carries only render data
 * (mesh groups, default colours); cosmetics.selftest.cjs keeps the id / slot lists equal.
 *
 * A look (stored per user in world_avatar_looks, relayed with `world:look`):
 *   { v: 1, hair, top, face, acc: [ids], skin: 0..5, colors: { hair?, top?, <accId>? } }
 * colour values are indexes into the panel's colour row (0..5), never free hex strings.
 *
 * Error bodies carry machine codes only ({ error: code, code }); the panel translates them.
 *
 * Pure module: no database, no network.
 */

const LOOK_VERSION = 1;
const COLOR_COUNT = 6;
const SKIN_COUNT = 6;
const MAX_ACCESSORIES = 4;
const ID_RE = /^[a-z][a-z0-9_]{2,39}$/;

const SLOTS = ["hair", "top", "acc", "face"];

/**
 * Order = grid order in the panel (3 x 2 per tab). Kıyafet follows the draft exactly:
 * Kapüşonlu (free), Bomber 150, Kolej ceket 220, Yelek 120, Yağmurluk 180, Çizgili (free).
 * Accessories carry a `zone`: one item per zone (a cap and a beanie never stack).
 */
const ITEMS = Object.freeze([
  { id: "hair_swept", slot: "hair", price: 0 },
  { id: "hair_fringe", slot: "hair", price: 90 },
  { id: "hair_bob", slot: "hair", price: 0 },
  { id: "hair_bun", slot: "hair", price: 0 },
  { id: "hair_ponytail", slot: "hair", price: 110 },
  { id: "hair_curly", slot: "hair", price: 140 },
  { id: "top_hoodie", slot: "top", price: 0 },
  { id: "top_bomber", slot: "top", price: 150 },
  { id: "top_varsity", slot: "top", price: 220 },
  { id: "top_vest", slot: "top", price: 120 },
  { id: "top_raincoat", slot: "top", price: 180 },
  { id: "top_striped", slot: "top", price: 0 },
  { id: "acc_headphones", slot: "acc", zone: "head", price: 140 },
  { id: "acc_cap", slot: "acc", zone: "head", price: 90 },
  { id: "acc_glasses", slot: "acc", zone: "eyes", price: 0 },
  { id: "acc_scarf", slot: "acc", zone: "neck", price: 0 },
  { id: "acc_backpack", slot: "acc", zone: "back", price: 160 },
  { id: "acc_beanie", slot: "acc", zone: "head", price: 70 },
  { id: "face_classic", slot: "face", price: 0 },
  { id: "face_lashes", slot: "face", price: 0 },
  { id: "face_bold", slot: "face", price: 60 },
  { id: "face_sleepy", slot: "face", price: 60 },
  { id: "face_grin", slot: "face", price: 80 },
  { id: "face_freckles", slot: "face", price: 50 },
].map((it) => Object.freeze({ ...it, free: it.price === 0 })));

const BY_ID = new Map(ITEMS.map((it) => [it.id, it]));

/** Look every account starts from (all free items). */
const BASE_LOOK = Object.freeze({ v: LOOK_VERSION, hair: "hair_swept", top: "top_hoodie", face: "face_classic", acc: [], skin: 0, colors: {} });

function item(id) {
  return BY_ID.get(String(id)) || null;
}

function priceOf(id) {
  const it = item(id);
  return it ? it.price : null;
}

/** Public catalog for the panel (server prices). */
function publicCatalog() {
  return ITEMS.map((it) => ({ id: it.id, slot: it.slot, price: it.price, free: it.free, zone: it.zone || null }));
}

function intIn(v, lo, hi) {
  return Number.isInteger(v) && v >= lo && v <= hi;
}

/**
 * Strict validation of a look from a client or the database.
 * Returns { ok: true, look } (a fresh normalised object) or { ok: false, error }.
 */
function validateLook(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "look_shape" };
  if (raw.v != null && raw.v !== LOOK_VERSION) return { ok: false, error: "look_version" };
  const out = { v: LOOK_VERSION, hair: null, top: null, face: null, acc: [], skin: 0, colors: {} };
  for (const slot of ["hair", "top", "face"]) {
    const id = raw[slot];
    if (typeof id !== "string" || !ID_RE.test(id)) return { ok: false, error: `bad_${slot}` };
    const it = item(id);
    if (!it || it.slot !== slot) return { ok: false, error: `bad_${slot}` };
    out[slot] = id;
  }
  const acc = raw.acc == null ? [] : raw.acc;
  if (!Array.isArray(acc) || acc.length > MAX_ACCESSORIES) return { ok: false, error: "bad_acc" };
  const zones = new Set();
  for (const id of acc) {
    if (typeof id !== "string" || !ID_RE.test(id)) return { ok: false, error: "bad_acc" };
    const it = item(id);
    if (!it || it.slot !== "acc") return { ok: false, error: "bad_acc" };
    if (out.acc.includes(id)) return { ok: false, error: "dup_acc" };
    if (zones.has(it.zone)) return { ok: false, error: "acc_zone" };
    zones.add(it.zone);
    out.acc.push(id);
  }
  // stable order (catalog order), so equal looks compare equal
  out.acc.sort((a, b) => ITEMS.indexOf(item(a)) - ITEMS.indexOf(item(b)));
  const skin = raw.skin == null ? 0 : raw.skin;
  if (!intIn(skin, 0, SKIN_COUNT - 1)) return { ok: false, error: "bad_skin" };
  out.skin = skin;
  const colors = raw.colors == null ? {} : raw.colors;
  if (typeof colors !== "object" || Array.isArray(colors)) return { ok: false, error: "bad_colors" };
  const keys = Object.keys(colors);
  if (keys.length > 2 + MAX_ACCESSORIES) return { ok: false, error: "bad_colors" };
  for (const k of keys) {
    const v = colors[k];
    if (v == null) continue;
    const allowed = k === "hair" || k === "top" || out.acc.includes(k);
    if (!allowed || !intIn(v, 0, COLOR_COUNT - 1)) return { ok: false, error: "bad_colors" };
    out.colors[k] = v;
  }
  return { ok: true, look: out };
}

/** Item ids a look uses (hair, top, face, accessories). */
function itemsOf(look) {
  return [look.hair, look.top, look.face, ...(look.acc || [])].filter(Boolean);
}

/** Paid items in the look that the owner does not have yet, with server prices. */
function unownedPaid(look, owned) {
  const have = owned instanceof Set ? owned : new Set(owned || []);
  const out = [];
  for (const id of itemsOf(look)) {
    const it = item(id);
    if (it && !it.free && !have.has(id)) out.push({ id, price: it.price });
  }
  return out;
}

/**
 * The client asks to buy `ids` and confirms the total it was shown. Prices come from the
 * catalog; a different total means the client's view is stale (409, show the new total).
 */
function priceRequest(ids, confirmedTotal) {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > ITEMS.length) return { ok: false, error: "bad_items" };
  const seen = new Set();
  const items = [];
  for (const id of ids) {
    if (typeof id !== "string" || !ID_RE.test(id) || seen.has(id)) return { ok: false, error: "bad_items" };
    seen.add(id);
    const it = item(id);
    if (!it) return { ok: false, error: "bad_items" };
    if (it.free) continue; // free items are never sold
    items.push({ id, price: it.price });
  }
  const total = items.reduce((s, x) => s + x.price, 0);
  if (confirmedTotal != null && Number(confirmedTotal) !== total) return { ok: false, error: "price_changed", total, items };
  return { ok: true, items, total };
}

/**
 * Loaded looks must still be wearable: an item that is no longer owned (refund, catalog
 * change) falls back to the base look for that slot, accessories are dropped.
 */
function wearable(look, owned) {
  const have = owned instanceof Set ? owned : new Set(owned || []);
  const ok = (id) => {
    const it = item(id);
    return Boolean(it && (it.free || have.has(id)));
  };
  const out = { ...look, acc: look.acc.filter(ok), colors: { ...look.colors } };
  for (const slot of ["hair", "top", "face"]) if (!ok(out[slot])) out[slot] = BASE_LOOK[slot];
  for (const k of Object.keys(out.colors)) if (k !== "hair" && k !== "top" && !out.acc.includes(k)) delete out.colors[k];
  return out;
}

function sameLook(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Purchase request ids: client generated, used for idempotency. */
function cleanRequestId(v) {
  const s = typeof v === "string" ? v.trim() : "";
  return /^[A-Za-z0-9_-]{8,64}$/.test(s) ? s : "";
}

module.exports = {
  LOOK_VERSION,
  COLOR_COUNT,
  SKIN_COUNT,
  MAX_ACCESSORIES,
  SLOTS,
  ITEMS,
  BASE_LOOK,
  item,
  priceOf,
  publicCatalog,
  validateLook,
  itemsOf,
  unownedPaid,
  priceRequest,
  wearable,
  sameLook,
  cleanRequestId,
};
