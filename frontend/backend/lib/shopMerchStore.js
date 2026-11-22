"use strict";

/**
 * Database side of the shop merchandising rules (lib/shopMerch.js): campaigns, storefront
 * sections, the shop updates feed, the merch columns on shop_items, race-safe stock and sales
 * rows. Every read tolerates the 20261115_shop_desk.sql migration not being applied yet
 * (missing table / column / function -> empty result, `installed: false`), so the shop keeps
 * working exactly as before until it is.
 */

const merch = require("./shopMerch");

const CONTEXT_TTL_MS = 30_000;
const SALES_TTL_MS = 5 * 60_000;
const PAGE = 1000;

function db() {
  return require("../db/supabase");
}

function isMissing(err) {
  if (!err) return false;
  const code = String(err.code || "");
  const msg = String(err.message || err.details || err.hint || "");
  return (
    ["42P01", "42703", "42883", "PGRST200", "PGRST202", "PGRST204", "PGRST205"].includes(code) ||
    /does not exist|schema cache|could not find/i.test(msg)
  );
}

let ctxCache = null;
let ctxLoading = null;
let salesCache = null;

function invalidateLocal() {
  ctxCache = null;
  salesCache = null;
}
// Hybrid server: clearing this cache also clears it on the other nodes (no-op on a single node).
const invalidate = require("./cluster").linkInvalidate("shopMerch", invalidateLocal);

async function safeRows(query) {
  try {
    const { data, error } = await query;
    if (error) return { rows: [], missing: isMissing(error), error };
    return { rows: data || [], missing: false, error: null };
  } catch (err) {
    return { rows: [], missing: isMissing(err), error: err };
  }
}

/** Campaigns that are not over yet + enabled sections + recent updates (cached 30 s). */
async function getContext() {
  if (ctxCache && Date.now() - ctxCache.at < CONTEXT_TTL_MS) return ctxCache;
  if (ctxLoading) return ctxLoading;
  ctxLoading = (async () => {
    const since = new Date(Date.now() - 14 * merch.DAY_MS).toISOString();
    const [c, s, u] = await Promise.all([
      safeRows(db().from("shop_campaigns").select("id, name, kind, discount_pct, scope, starts_at, ends_at, enabled").gte("ends_at", new Date().toISOString())),
      safeRows(db().from("shop_storefront_sections").select("id, title, subtitle, kind, item_ids, config, sort_order, enabled, visible_from, visible_until, created_at").eq("enabled", true).order("sort_order", { ascending: true })),
      safeRows(db().from("shop_updates").select("id, body, item_ids, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(3)),
    ]);
    ctxCache = {
      at: Date.now(),
      campaigns: c.rows,
      sections: s.rows,
      updates: u.rows,
      installed: !c.missing && !s.missing,
    };
    return ctxCache;
  })();
  try {
    return await ctxLoading;
  } finally {
    ctxLoading = null;
  }
}

/** Fresh (uncached) campaigns for a purchase decision. */
async function liveCampaigns() {
  const { rows } = await safeRows(
    db().from("shop_campaigns").select("id, name, kind, discount_pct, scope, starts_at, ends_at, enabled").gte("ends_at", new Date().toISOString())
  );
  return rows;
}

/**
 * Merch columns of shop_items keyed by id. `ids` null = every row.
 * Returns { byId: Map, installed }.
 */
async function loadMerchColumns(ids = null) {
  let q = db().from("shop_items").select(merch.MERCH_COLUMNS);
  if (Array.isArray(ids)) {
    if (!ids.length) return { byId: new Map(), installed: true };
    q = q.in("id", ids);
  }
  const { rows, missing } = await safeRows(q);
  if (missing) return { byId: new Map(), installed: false };
  return { byId: new Map(rows.map((r) => [String(r.id), r])), installed: true };
}

/** Merge merch columns into item rows (non-destructive). */
function withMerch(items, byId) {
  return (items || []).map((it) => {
    const m = byId.get(String(it.id));
    if (!m) return it;
    return {
      ...it,
      stock_limit: m.stock_limit ?? null,
      stock_sold: m.stock_sold ?? 0,
      available_from: m.available_from ?? null,
      available_until: m.available_until ?? null,
      sale_pct: m.sale_pct ?? null,
      sale_starts_at: m.sale_starts_at ?? null,
      sale_ends_at: m.sale_ends_at ?? null,
      updated_at: m.updated_at ?? null,
    };
  });
}

/** One item with its merch columns, read fresh (purchase path). */
async function freshItemMerch(itemId) {
  const { byId, installed } = await loadMerchColumns([itemId]);
  return { merch: byId.get(String(itemId)) || null, installed };
}

/**
 * Take one unit of a limited item. Returns { ok, sold }.
 * Uses the shop_reserve_stock RPC (one conditional UPDATE); without it, a compare-and-swap
 * on stock_sold that retries when another buyer won the race.
 */
async function reserveStock(itemId) {
  const client = db();
  if (typeof client.rpc === "function") {
    try {
      const { data, error } = await client.rpc("shop_reserve_stock", { p_item_id: itemId });
      if (!error) {
        const sold = Array.isArray(data) ? data[0] : data;
        const n = typeof sold === "object" && sold ? Object.values(sold)[0] : sold;
        return n == null ? { ok: false, sold: null } : { ok: true, sold: Number(n) };
      }
      if (!isMissing(error)) throw error;
    } catch (err) {
      if (!isMissing(err)) throw err;
    }
  }
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data: row, error } = await client.from("shop_items").select("id, stock_limit, stock_sold").eq("id", itemId).maybeSingle();
    if (error) throw error;
    if (!row) return { ok: false, sold: null };
    const limit = row.stock_limit == null ? null : Number(row.stock_limit);
    const sold = Number(row.stock_sold) || 0;
    if (limit != null && sold >= limit) return { ok: false, sold };
    const { data: updated, error: upErr } = await client
      .from("shop_items")
      .update({ stock_sold: sold + 1 })
      .eq("id", itemId)
      .eq("stock_sold", sold)
      .select("stock_sold")
      .maybeSingle();
    if (upErr) throw upErr;
    if (updated) return { ok: true, sold: Number(updated.stock_sold) };
  }
  const err = new Error("STOCK_CONFLICT");
  err.code = "STOCK_CONFLICT";
  throw err;
}

async function releaseStock(itemId) {
  const client = db();
  if (typeof client.rpc === "function") {
    try {
      const { error } = await client.rpc("shop_release_stock", { p_item_id: itemId });
      if (!error) return true;
      if (!isMissing(error)) throw error;
    } catch (err) {
      if (!isMissing(err)) throw err;
    }
  }
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data: row } = await client.from("shop_items").select("id, stock_sold").eq("id", itemId).maybeSingle();
    if (!row) return false;
    const sold = Number(row.stock_sold) || 0;
    if (sold <= 0) return true;
    const { data: updated } = await client.from("shop_items").update({ stock_sold: sold - 1 }).eq("id", itemId).eq("stock_sold", sold).select("stock_sold").maybeSingle();
    if (updated) return true;
  }
  return false;
}

/** Paid purchase rows since `sinceIso` (optionally one item), paged. */
async function purchasesSince(sinceIso, { itemId = null, max = 50_000 } = {}) {
  const out = [];
  for (let from = 0; from < max; from += PAGE) {
    let q = db()
      .from("shop_purchases")
      .select("id, user_id, item_id, amount_descoin, status, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (itemId) q = q.eq("item_id", itemId);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data || []).filter((r) => !r.status || r.status === "paid");
    out.push(...rows);
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Sales count per item over the last `days` (cached 5 min, used by bestseller sections). */
async function salesByItem(days = 7) {
  if (salesCache && salesCache.days === days && Date.now() - salesCache.at < SALES_TTL_MS) return salesCache.map;
  const map = new Map();
  try {
    const rows = await purchasesSince(new Date(Date.now() - days * merch.DAY_MS).toISOString());
    for (const r of rows) map.set(String(r.item_id), (map.get(String(r.item_id)) || 0) + 1);
  } catch {
    /* empty sections are fine */
  }
  salesCache = { at: Date.now(), days, map };
  return map;
}

module.exports = {
  isMissing,
  invalidate,
  getContext,
  liveCampaigns,
  loadMerchColumns,
  withMerch,
  freshItemMerch,
  reserveStock,
  releaseStock,
  purchasesSince,
  salesByItem,
};
