"use strict";

/**
 * Admin "Promosyon Kodları" API. Mounted inside routes/admin.js after
 * requireAuth + requireAdmin, so every handler here is admin-only on the server.
 * Each write is recorded in promo_audit by the database function itself.
 */

const express = require("express");
const supabase = require("../db/supabase");
const promo = require("../lib/promo");
const userSearch = require("../lib/promoUserSearch");
const rateLimit = require("../lib/rateLimit");

const router = express.Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function send(res, err) {
  const status = err?.status || 500;
  if (status >= 500) console.error("[admin/promo]", err?.cause?.message || err?.message || "error");
  res.status(status).json({ error: err?.code || "server_error", code: err?.code || "server_error" });
}

router.get("/promo-codes", async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(await promo.adminOverview());
  } catch (err) {
    send(res, err);
  }
});

router.get("/promo-codes/generate", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ code: promo.generateCode() });
});

// Item picker for "Mağaza eşyası": every item on sale (active; that is the Market 2.0 s2-
// catalog plus country flags since the old catalog was retired), with what the picker shows
// (localized names, category, rarity, set, art).
// Paged past PostgREST's 1000-row cap; no silent 500 limit (the shop has ~900 rows).
const SHOP_ITEM_FIELDS = "id, sku, name, i18n, description, category, rarity, set_key, price_descoin, asset_url, preview_url, badge_icon, sort_order";
const SHOP_ITEM_FIELDS_MIN = "id, sku, name, category, price_descoin";
const SHOP_ITEM_PAGE = 1000;
const SHOP_ITEM_MAX = 5000;

async function loadPromoShopItems(fields) {
  const out = [];
  for (let from = 0; from < SHOP_ITEM_MAX; from += SHOP_ITEM_PAGE) {
    const { data, error } = await supabase
      .from("shop_items")
      .select(fields)
      .eq("active", true)
      .order("id", { ascending: true })
      .range(from, from + SHOP_ITEM_PAGE - 1);
    if (error) return { error };
    out.push(...(data || []));
    if (!data || data.length < SHOP_ITEM_PAGE) break;
  }
  return { rows: out };
}

router.get("/promo-codes/shop-items", async (_req, res) => {
  try {
    let got = await loadPromoShopItems(SHOP_ITEM_FIELDS);
    // An older database without the Market 2.0 columns: the plain list still works.
    if (got.error) got = await loadPromoShopItems(SHOP_ITEM_FIELDS_MIN);
    if (got.error) throw Object.assign(new Error("shop_items"), { status: 500 });
    const items = got.rows.sort((a, b) =>
      String(a.category).localeCompare(String(b.category))
      || (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
      || String(a.name || "").localeCompare(String(b.name || "")));
    res.set("Cache-Control", "no-store");
    res.json({ items });
  } catch (err) {
    send(res, err);
  }
});

// People picker for "Seçilenler". Ranked closest match first (exact, then
// prefix, then contains, then letters in order), Turkish-folded and case
// insensitive, leading @ ignored, banned/deleted accounts skipped. Per-admin
// rate limit; only id / username / display_name / avatar_url are returned.
const SEARCH_WINDOW_MS = 60 * 1000;
const SEARCH_MAX = 120;
const MISSING_FN = new Set(["PGRST202", "42883"]);

async function searchUsers(q, exclude, limit) {
  const { data, error } = await supabase.rpc("promo_admin_user_search", {
    p_q: q,
    p_exclude: exclude,
    p_limit: limit,
  });
  if (!error) return (data || []).map(userSearch.publicUser);
  if (!MISSING_FN.has(error.code) && !/promo_admin_user_search/.test(error.message || "")) {
    throw Object.assign(new Error("users"), { status: 500, cause: error });
  }
  // Function not deployed yet: same ranking in JS over the active accounts.
  const all = await supabase
    .from("users")
    .select("id, username, display_name, avatar_url, deleted_at, is_banned")
    .is("deleted_at", null)
    .limit(5000);
  if (all.error) throw Object.assign(new Error("users"), { status: 500, cause: all.error });
  return userSearch.rankUsers(all.data, q, { exclude, limit });
}

router.get("/promo-codes/users", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const limited = rateLimit.recordFailure(`promo-user-search:${req.user.id}`, {
      windowMs: SEARCH_WINDOW_MS,
      max: SEARCH_MAX,
    });
    if (rateLimit.rejectIfLimited(res, [limited])) return;
    const q = userSearch.cleanQuery(req.query.q);
    if (!q) return res.json({ users: [] });
    const exclude = userSearch.cleanExclude(req.query.exclude);
    const limit = userSearch.clampLimit(req.query.limit);
    res.json({ users: await searchUsers(q, exclude, limit) });
  } catch (err) {
    send(res, err);
  }
});

router.post("/promo-codes", async (req, res) => {
  try {
    const created = await promo.adminCreate(req.user.id, req.body || {});
    promo.nudgePopup(req.app.get("io"), created);
    res.status(201).json({ id: created.id, code: created.code });
  } catch (err) {
    send(res, err);
  }
});

router.patch("/promo-codes/:id", async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) throw new promo.PromoError("not_found", 404);
    await promo.adminUpdate(req.user.id, req.params.id, req.body || {});
    res.json({ ok: true });
  } catch (err) {
    send(res, err);
  }
});

router.get("/promo-codes/:id/redemptions", async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) throw new promo.PromoError("not_found", 404);
    res.set("Cache-Control", "no-store");
    res.json(await promo.adminRedemptions(req.params.id, req.query || {}));
  } catch (err) {
    send(res, err);
  }
});

module.exports = router;
