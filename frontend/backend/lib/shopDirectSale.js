"use strict";

/**
 * "Tüm ürünler" (the classic catalog inside Market 2.0) is browse only (owner, 16 Nov 2026):
 * every item is listed, but only rows with shop_items.direct_sale = true can be bought from it
 * (POST /api/shop/purchase). Market 2.0 purchases (storefront, sets, night market, shop2 gifts),
 * admin grants and admin gifts never look at this.
 *
 * Before 20261116_shop_direct_sale.sql is applied the column is missing: every `s2-` item is
 * then not directly buyable and older rows (country flags) keep the old behaviour. The
 * migration starts flags at true, everything else at false.
 *
 * Also: the localized text and set key of `s2-` items for the classic catalog payload (the
 * shop_items row strings are English; the Market 2.0 catalog has the 7 languages).
 */

const SHOP2_SKU_PREFIX = "s2-";
const COLUMNS = "id, direct_sale";
const PAGE = 1000;

function db() {
  return require("../db/supabase");
}

function isShop2Sku(sku) {
  return typeof sku === "string" && sku.startsWith(SHOP2_SKU_PREFIX);
}

function isMissing(err) {
  if (!err) return false;
  const code = String(err.code || "");
  const msg = String(err.message || err.details || err.hint || "");
  return ["42703", "42P01", "PGRST204", "PGRST205"].includes(code) || /does not exist|schema cache|could not find/i.test(msg);
}

/** True when this row can be bought straight from "Tüm ürünler". */
function directSaleAllowed(item) {
  if (!item) return false;
  if (typeof item.direct_sale === "boolean") return item.direct_sale;
  return !isShop2Sku(item.sku);
}

/**
 * direct_sale of shop_items keyed by id (`ids` null = every row).
 * Returns { byId: Map<string, boolean>, installed }. Never throws for a missing column.
 */
async function loadColumn(ids = null) {
  const byId = new Map();
  if (Array.isArray(ids) && !ids.length) return { byId, installed: true };
  try {
    for (let from = 0; ; from += PAGE) {
      let q = db().from("shop_items").select(COLUMNS);
      q = Array.isArray(ids) ? q.in("id", ids) : q.order("id", { ascending: true }).range(from, from + PAGE - 1);
      const { data, error } = await q;
      if (error) {
        if (isMissing(error)) return { byId: new Map(), installed: false };
        throw error;
      }
      for (const r of data || []) if (typeof r?.direct_sale === "boolean") byId.set(String(r.id), r.direct_sale);
      if (Array.isArray(ids) || (data || []).length < PAGE) break;
    }
  } catch (err) {
    if (isMissing(err)) return { byId: new Map(), installed: false };
    throw err;
  }
  return { byId, installed: true };
}

/** Rows with their direct_sale value merged in (unchanged when the column has none). */
function withColumn(items, byId) {
  return (items || []).map((it) => (byId.has(String(it.id)) ? { ...it, direct_sale: byId.get(String(it.id)) } : it));
}

/** Purchase path: read fresh, so an admin change applies to the very next buy. */
async function freshAllowed(item) {
  if (!item) return false;
  const { byId } = await loadColumn([item.id]);
  return directSaleAllowed(byId.has(String(item.id)) ? { ...item, direct_sale: byId.get(String(item.id)) } : item);
}

/**
 * Set direct_sale on `ids`. Returns { changedIds, installed }. `changedIds` are the rows whose
 * value really changed (the admin "Geri al" flips exactly those back).
 */
async function setAllowed(ids, allowed) {
  const list = [...new Set((ids || []).map(String).filter(Boolean))].slice(0, 2000);
  if (!list.length) return { changedIds: [], installed: true };
  const before = await loadColumn(list);
  if (!before.installed) {
    const err = new Error("direct_sale_unavailable");
    err.code = "direct_sale_unavailable";
    err.status = 409;
    throw err;
  }
  const want = Boolean(allowed);
  const changedIds = list.filter((id) => before.byId.get(id) !== want);
  for (let i = 0; i < changedIds.length; i += 200) {
    const chunk = changedIds.slice(i, i + 200);
    const { error } = await db().from("shop_items").update({ direct_sale: want }).in("id", chunk);
    if (error) throw error;
  }
  return { changedIds, installed: true };
}

/**
 * Localized text and set key of `s2-` rows from the Market 2.0 catalog (its own fallback reads
 * the catalog data files when shop_items lacks the columns). Map id -> { i18n, set_key }.
 */
async function shop2Meta() {
  const out = new Map();
  try {
    const cat = await require("./shop2/catalog").getCatalog();
    for (const it of cat?.items || []) {
      if (!isShop2Sku(it.sku)) continue;
      const i18n = it.i18n && typeof it.i18n === "object" && it.i18n.name && typeof it.i18n.name === "object" ? it.i18n : null;
      out.set(String(it.id), { i18n, set_key: it.setKey || null });
    }
  } catch (err) {
    console.warn("[shop] Market 2.0 item text unavailable:", err?.message || err);
  }
  return out;
}

function withShop2Meta(items, meta) {
  if (!meta || !meta.size) return items;
  return (items || []).map((it) => {
    const m = meta.get(String(it.id));
    return m ? { ...it, i18n: m.i18n || it.i18n || null, set_key: m.set_key || it.set_key || null } : it;
  });
}

/**
 * Admin panel ("Tüm ürünlerde satış"): every item listed in "Tüm ürünler" with its state and
 * the last 7 days of direct sales (shop_purchases = POST /api/shop/purchase receipts).
 */
async function adminOverview({ assetBase = "", now = Date.now() } = {}) {
  const shop = require("./shop");
  const [items, column, purchases] = await Promise.all([
    shop.listActiveItems({ assetBase, now }),
    loadColumn(null).catch(() => ({ byId: new Map(), installed: false })),
    require("./shopMerchStore").purchasesSince(new Date(now - 7 * 86_400_000).toISOString()).catch(() => []),
  ]);
  const sales = new Map();
  for (const p of purchases) {
    const k = String(p.item_id);
    const s = sales.get(k) || { n: 0, coins: 0 };
    s.n += 1;
    s.coins += Number(p.amount_descoin) || 0;
    sales.set(k, s);
  }
  const rows = items.map((it) => {
    const s = sales.get(String(it.id)) || { n: 0, coins: 0 };
    return { ...it, direct_sale: Boolean(it.direct_sale), stored: column.byId.has(String(it.id)) ? column.byId.get(String(it.id)) : null, sales7: s.n, coins7: s.coins };
  });
  const totals = { all: rows.length, allowed: 0, blocked: 0, sales7: 0, coins7: 0, shop2: 0 };
  const byCategory = {};
  for (const r of rows) {
    totals[r.direct_sale ? "allowed" : "blocked"] += 1;
    totals.sales7 += r.sales7;
    totals.coins7 += r.coins7;
    if (isShop2Sku(r.sku)) totals.shop2 += 1;
    const c = byCategory[r.category] || (byCategory[r.category] = { all: 0, allowed: 0 });
    c.all += 1;
    if (r.direct_sale) c.allowed += 1;
  }
  return { installed: column.installed, items: rows, totals, byCategory, serverTime: new Date(now).toISOString() };
}

module.exports = {
  SHOP2_SKU_PREFIX,
  adminOverview,
  directSaleAllowed,
  loadColumn,
  withColumn,
  freshAllowed,
  setAllowed,
  shop2Meta,
  withShop2Meta,
  isMissing,
};
