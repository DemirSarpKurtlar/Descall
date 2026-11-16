"use strict";

/**
 * Market 2.0 catalog: the sellable pool (shop_items rows with an `s2-` sku), item payloads for
 * the client, and sets (theme defaults merged with shop2_sets rows).
 *
 * Retired = everything that is not an active `s2-` row, or an `s2-` row with retired_at set.
 * Owners keep retired items (they still render); they are never offered here.
 * Degraded: until the s2 catalog is seeded the pool falls back to the active legacy items so
 * the storefront is never empty in a dev database; set metadata (set_key, names in 7
 * languages, tags) is read from backend/catalog/shop2/*.js when shop_items lacks the columns.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const db = require("./db");
const { THEMES, THEME_BY_KEY, SET_PIECE_CATEGORIES } = require("./themes");

const BASE_COLUMNS =
  "id, sku, name, description, category, asset_url, preview_url, price_descoin, theme_key, badge_icon, effect_key, active, rarity, sort_order, created_at";
const EXTRA_COLUMNS = "set_key, retired_at, i18n, tags";
const CACHE_MS = 60_000;
const NEVER_SOLD = new Set(["sound_pack", "profile_title", "profile_background", "countries"]);
const CATALOG_DIR = path.join(__dirname, "..", "..", "catalog", "shop2");

let cache = null;
let loading = null;
let fileMeta = null;

function normalizeAsset(url) {
  if (typeof url !== "string" || !url) return null;
  return url.replace(/^data:image\/svg\+xml;utf8,/i, "data:image/svg+xml;charset=utf-8,");
}

function versionOf(url) {
  return crypto.createHash("sha1").update(String(url)).digest("hex").slice(0, 12);
}

/** sku -> { set_key, tags, name, description } from the catalog data files (degraded path). */
function loadFileMeta() {
  if (fileMeta) return fileMeta;
  fileMeta = new Map();
  let entries = [];
  try {
    entries = fs.readdirSync(CATALOG_DIR, { withFileTypes: true });
  } catch {
    return fileMeta;
  }
  for (const e of entries) {
    if (e.name === "seed.js" || e.name.startsWith(".")) continue;
    const full = path.join(CATALOG_DIR, e.name);
    if (!(e.isDirectory() || e.name.endsWith(".js"))) continue;
    try {
      const mod = require(full);
      for (const it of Array.isArray(mod?.items) ? mod.items : []) {
        if (it && typeof it.sku === "string") fileMeta.set(it.sku, { set_key: it.set_key || null, tags: it.tags || [], name: it.name || null, description: it.description || null });
      }
    } catch (err) {
      if (err?.code !== "MODULE_NOT_FOUND") console.warn(`[shop2] catalog file ${e.name} skipped:`, err?.message || err);
    }
  }
  return fileMeta;
}

function toPoolItem(row, meta) {
  const m = meta || {};
  const i18n = row.i18n && typeof row.i18n === "object" ? row.i18n : { name: m.name || null, description: m.description || null };
  const asset = normalizeAsset(row.asset_url);
  const preview = normalizeAsset(row.preview_url);
  return {
    id: row.id,
    sku: row.sku,
    category: row.category,
    rarity: row.rarity || "common",
    price: Math.max(0, Math.round(Number(row.price_descoin) || 0)),
    setKey: row.set_key || m.set_key || null,
    effectKey: row.effect_key || null,
    themeKey: row.theme_key || null,
    badgeIcon: row.badge_icon || null,
    name: row.name,
    description: row.description,
    i18n,
    tags: Array.isArray(row.tags) ? row.tags : m.tags || [],
    sortOrder: row.sort_order || 0,
    createdAt: row.created_at || null,
    active: row.active !== false,
    // Old frames / badges (non s2- sku) stay removed even in the legacy fallback pool.
    retired: Boolean(row.retired_at) || NEVER_SOLD.has(row.category) || require("../shop").isRemovedCosmeticItem(row),
    legacy: !String(row.sku || "").startsWith("s2-"),
    asset,
    preview,
    assetVersion: asset && /^data:/i.test(asset) ? versionOf(asset) : null,
    previewVersion: preview && /^data:/i.test(preview) && preview !== asset ? versionOf(preview) : null,
  };
}

async function selectItems(build) {
  const client = db.real();
  let res = await build(client.from("shop_items").select(`${BASE_COLUMNS}, ${EXTRA_COLUMNS}`));
  let extra = true;
  if (res.error && db.isMissingColumn(res.error)) {
    extra = false;
    res = await build(client.from("shop_items").select(BASE_COLUMNS));
  }
  if (res.error) throw res.error;
  return { rows: res.data || [], extra };
}

async function loadAll() {
  const { rows: s2, extra } = await selectItems((q) => q.like("sku", "s2-%"));
  const meta = extra ? null : loadFileMeta();
  let items = s2.map((r) => toPoolItem(r, meta ? meta.get(r.sku) : null));
  let legacyPool = false;
  if (!items.some((it) => it.active && !it.retired)) {
    // Not seeded yet: sell the active legacy catalog so a dev storefront still works.
    const { rows: old } = await selectItems((q) => q.eq("active", true));
    items = old.filter((r) => !String(r.sku || "").startsWith("s2-")).map((r) => toPoolItem(r, null));
    legacyPool = true;
  }
  const byId = new Map(items.map((it) => [String(it.id), it]));
  return { at: Date.now(), items, byId, legacyPool };
}

async function getCatalog({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache;
  if (!loading) {
    loading = loadAll()
      .then((c) => (cache = c))
      .finally(() => (loading = null));
  }
  return loading;
}

function invalidate() {
  cache = null;
}

/** Sellable now: active, not retired, (s2 unless the legacy fallback is on). */
function sellable(item) {
  return Boolean(item && item.active && !item.retired);
}

/** Client payload of an item. Inline SVGs become short URLs (GET /api/shop2/assets/:id). */
function publicItem(item, base = "", extra = {}) {
  if (!item) return null;
  const b = String(base || "").replace(/\/+$/, "");
  const url = (u, v, kind) => {
    if (!u) return null;
    if (!/^data:/i.test(u)) return u;
    // "data:," (effects, bubbles, themes, sounds draw from their recipe): no image to serve.
    if (!/^data:image\//i.test(u)) return null;
    return `${b}/api/shop2/assets/${encodeURIComponent(item.id)}?${kind === "preview" ? "kind=preview&" : ""}v=${v}`;
  };
  return {
    id: item.id,
    sku: item.sku,
    category: item.category,
    rarity: item.rarity,
    price_descoin: item.price,
    set_key: item.setKey,
    effect_key: item.effectKey,
    theme_key: item.themeKey,
    badge_icon: item.badgeIcon,
    asset_url: url(item.asset, item.assetVersion, "asset"),
    preview_url: item.previewVersion ? url(item.preview, item.previewVersion, "preview") : item.preview && !/^data:/i.test(item.preview) ? item.preview : null,
    name: item.name,
    description: item.description,
    i18n: item.i18n,
    tags: item.tags,
    legacy: item.legacy,
    ...extra,
  };
}

/** Bytes of an s2 item's inline image for the public asset route. */
async function assetOf(itemId, kind = "asset") {
  const c = await getCatalog();
  const it = c.byId.get(String(itemId));
  if (!it) return null;
  const url = kind === "preview" ? it.preview : it.asset;
  const m = /^data:([^,;]+)(;[^,]*)?,(.*)$/is.exec(String(url || ""));
  if (!m) return null;
  const type = m[1].toLowerCase();
  if (!/^image\/(svg\+xml|png|webp|jpeg|gif)$/.test(type)) return null;
  const isB64 = /;base64/i.test(m[2] || "");
  let body;
  try {
    body = isB64 ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]), "utf8");
  } catch {
    return null;
  }
  return { contentType: type === "image/svg+xml" ? "image/svg+xml; charset=utf-8" : type, body, version: kind === "preview" ? it.previewVersion : it.assetVersion };
}

/* ---------------------------------------------------------------- sets */

function themeDefaults(key) {
  const t = THEME_BY_KEY.get(key);
  return {
    key,
    name: t ? t.name : { tr: key, en: key },
    palette: t ? t.palette : [],
    discountPct: 25,
    status: "live",
    startsAt: null,
    endsAt: null,
    stockLimit: null,
    stockSold: 0,
    pieceIds: null,
    version: 0,
    recall: null,
    source: "default",
    createdAt: null,
    updatedAt: null,
  };
}

function fromSetRow(row) {
  const base = themeDefaults(row.set_key);
  return {
    ...base,
    name: row.name && typeof row.name === "object" && Object.keys(row.name).length ? { ...base.name, ...row.name } : base.name,
    palette: Array.isArray(row.palette) && row.palette.length ? row.palette : base.palette,
    discountPct: row.discount_pct == null ? base.discountPct : Number(row.discount_pct),
    status: row.status || "draft",
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    stockLimit: row.stock_limit == null ? null : Number(row.stock_limit),
    stockSold: Number(row.stock_sold) || 0,
    pieceIds: Array.isArray(row.piece_ids) && row.piece_ids.length ? row.piece_ids.map(String) : null,
    version: Number(row.version) || 1,
    recall: row.recall || null,
    note: row.note || null,
    source: "db",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    createdBy: row.created_by || null,
  };
}

/**
 * Every set (defaults for the 16 themes + admin rows) with its pieces resolved from the pool.
 * pieces: [{ category, item|null }] in SET_PIECE_CATEGORIES order.
 */
async function getSets() {
  await db.ready();
  const [catalog, rowsRes] = await Promise.all([getCatalog(), db.rows(db.from("shop2_sets").select("*")).catch(() => [])]);
  const rowByKey = new Map(rowsRes.map((r) => [r.set_key, r]));
  const keys = new Set([...THEMES.map((t) => t.key), ...rowByKey.keys()]);
  for (const it of catalog.items) if (it.setKey) keys.add(it.setKey);
  const out = [];
  for (const key of keys) {
    const set = rowByKey.has(key) ? fromSetRow(rowByKey.get(key)) : themeDefaults(key);
    let pieceItems;
    if (set.pieceIds) pieceItems = set.pieceIds.map((id) => catalog.byId.get(String(id))).filter(Boolean);
    else pieceItems = catalog.items.filter((it) => it.setKey === key && !it.legacy);
    // A piece taken off sale (inactive / retired) is never sold or gifted through its set.
    pieceItems = pieceItems.filter(sellable);
    const byCat = new Map();
    for (const it of pieceItems.sort((a, b) => a.sortOrder - b.sortOrder)) if (!byCat.has(it.category)) byCat.set(it.category, it);
    const extras = pieceItems.filter((it) => !SET_PIECE_CATEGORIES.includes(it.category));
    set.pieces = [...SET_PIECE_CATEGORIES.map((category) => ({ category, item: byCat.get(category) || null })), ...extras.map((it) => ({ category: it.category, item: it }))];
    set.items = set.pieces.map((p) => p.item).filter(Boolean);
    if (!set.items.length && set.source === "default") continue;
    out.push(set);
  }
  const order = new Map(THEMES.map((t, i) => [t.key, i]));
  out.sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99) || (a.key < b.key ? -1 : 1));
  return out;
}

async function getSet(key) {
  return (await getSets()).find((s) => s.key === key) || null;
}

module.exports = { getCatalog, invalidate, sellable, publicItem, assetOf, getSets, getSet, themeDefaults, fromSetRow, toPoolItem, loadFileMeta, BASE_COLUMNS };
