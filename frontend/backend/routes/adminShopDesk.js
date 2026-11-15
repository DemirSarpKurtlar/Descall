"use strict";

/**
 * Yönetici Paneli › Mağaza (remake, owner pick Draft A control desk + Draft B operation tabs).
 * Mounted inside routes/admin.js after requireAuth + requireAdmin + 2FA + step-up + the section
 * check (lib/adminPermissions.js): /shop/* needs "shop", /shop/gifts* and /descoin/* need
 * "casino" (money-like). Every write is audited (state.appendAudit), pings the admin room and,
 * when the user shop changes, every connected client ("shop:catalog:changed").
 */

const express = require("express");
const supabase = require("../db/supabase");
const state = require("../runtime/sharedState");
const shop = require("../lib/shop");
const descoin = require("../lib/descoin");
const merch = require("../lib/shopMerch");
const store = require("../lib/shopMerchStore");
const { notifyAdminRoom } = require("../socket/adminHandlers");

const router = express.Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 1000;

function getIo(req) {
  return req.app.get("io");
}

function audit(req, action, target, meta) {
  return state.appendAudit(req.user.id, req.user.username, action, target, meta);
}

function fail(res, err, context = "shop_desk") {
  if (err?.status && err.status < 500) return res.status(err.status).json({ error: err.code || "bad_request", code: err.code || "bad_request" });
  console.error(`[admin/shop-desk] ${context}:`, err?.message || err);
  return res.status(500).json({ error: "server_error", code: "server_error" });
}

/** Errors carry a code only; the admin UI shows the localized text (shopDesk.err.<code>). */
function bad(code, status = 400) {
  const err = new Error(code);
  err.status = status;
  err.code = code;
  return err;
}

/** Catalog changed: drop caches, tell admins and every open user shop. */
function shopChanged(req, payload = {}) {
  shop.invalidateCatalogCache();
  store.invalidate();
  const io = getIo(req);
  if (!io) return;
  notifyAdminRoom(io, { type: "shop_changed", ...payload });
  io.emit("shop:catalog:changed", { reason: payload.reason || "admin" });
}

function cleanReason(v, max = 300) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

async function rows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function count(query) {
  try {
    const { count: n, error } = await query;
    if (error) return null;
    return n ?? 0;
  } catch {
    return null;
  }
}

/** Every item (including inactive) with merch columns, effective price and availability. */
async function allItemsWithMerch(campaigns, now = Date.now()) {
  const items = await shop.listAllItems();
  const { byId, installed } = await store.loadMerchColumns(null);
  const merged = store.withMerch(items, byId);
  return {
    installed,
    items: merged.map((it) => {
      const pricing = merch.effectivePricing(it, campaigns, now);
      const av = merch.availability(it, campaigns, now);
      return {
        ...it,
        asset_url: shop.IMAGE_ASSET_CATEGORIES.has(it.category) ? it.asset_url : null,
        retired: shop.RETIRED_SHOP_CATEGORIES.has(it.category),
        pricing,
        availability: av,
      };
    }),
  };
}

async function allCampaigns() {
  try {
    const since = new Date(Date.now() - 60 * merch.DAY_MS).toISOString();
    const { data, error } = await supabase
      .from("shop_campaigns")
      .select("id, name, kind, discount_pct, scope, starts_at, ends_at, enabled, note, created_by, created_at, updated_at")
      .gte("ends_at", since)
      .order("starts_at", { ascending: true });
    if (error) return { installed: !store.isMissing(error), campaigns: [] };
    return { installed: true, campaigns: data || [] };
  } catch (err) {
    return { installed: !store.isMissing(err), campaigns: [] };
  }
}

async function allSections() {
  try {
    const { data, error } = await supabase
      .from("shop_storefront_sections")
      .select("id, title, subtitle, kind, item_ids, config, sort_order, enabled, visible_from, visible_until, created_at, updated_at")
      .order("sort_order", { ascending: true });
    if (error) return { installed: !store.isMissing(error), sections: [] };
    return { installed: true, sections: (data || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)) };
  } catch (err) {
    return { installed: !store.isMissing(err), sections: [] };
  }
}

/** Per item: sales in the last 7 days, the 7 before, a 7-day series and revenue. */
function salesStats(purchases, now = Date.now()) {
  const days = merch.lastDays(7, now);
  const dayIdx = new Map(days.map((d, i) => [d, i]));
  const weekAgo = now - 7 * merch.DAY_MS;
  const byItem = new Map();
  const totals = { n7: 0, prev7: 0, spent7: 0, today: 0, spentToday: 0, series: days.map(() => 0) };
  const today = days[days.length - 1];
  for (const p of purchases) {
    const id = String(p.item_id);
    const t = Date.parse(p.created_at);
    const amt = Number(p.amount_descoin) || 0;
    let s = byItem.get(id);
    if (!s) {
      s = { n7: 0, prev7: 0, revenue7: 0, series: days.map(() => 0) };
      byItem.set(id, s);
    }
    if (t >= weekAgo) {
      s.n7 += 1;
      s.revenue7 += amt;
      totals.n7 += 1;
      totals.spent7 += amt;
      const k = dayIdx.get(merch.trDay(t));
      if (k != null) {
        s.series[k] += 1;
        totals.series[k] += 1;
      }
      if (merch.trDay(t) === today) {
        totals.today += 1;
        totals.spentToday += amt;
      }
    } else {
      s.prev7 += 1;
      totals.prev7 += 1;
    }
  }
  return { byItem, totals, days };
}

async function circulating() {
  try {
    const { data, error } = await supabase.rpc("shop_desk_totals", {}, { get: true });
    if (!error && data) return { circulating: Number(data.circulating) || 0, holders: Number(data.holders) || 0 };
  } catch {
    /* fall back below */
  }
  try {
    let total = 0;
    let holders = 0;
    for (let from = 0; from < 200_000; from += PAGE) {
      const page = await rows(supabase.from("users").select("descoin_balance").gt("descoin_balance", 0).range(from, from + PAGE - 1));
      for (const r of page) {
        total += Number(r.descoin_balance) || 0;
        holders += 1;
      }
      if (page.length < PAGE) break;
    }
    return { circulating: total, holders };
  } catch {
    return { circulating: null, holders: null };
  }
}

async function latestReconcile() {
  try {
    const { data, error } = await supabase
      .from("descoin_reconciliation_runs")
      .select("id, started_at, trigger, mismatch_count, abs_drift, error")
      .order("started_at", { ascending: false })
      .limit(1);
    if (error) return null;
    return (data && data[0]) || null;
  } catch {
    return null;
  }
}

/* ======================================================================== desk */

router.get("/shop/desk", async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const now = Date.now();
    const [{ campaigns, installed: campaignsInstalled }, { sections, installed: sectionsInstalled }] = await Promise.all([allCampaigns(), allSections()]);
    const since14 = new Date(now - 14 * merch.DAY_MS).toISOString();
    const since7 = new Date(now - 7 * merch.DAY_MS).toISOString();
    const dayStart = new Date(Date.parse(`${merch.trDay(now)}T00:00:00Z`) - merch.TR_OFFSET_MIN * 60_000).toISOString();
    const [{ items, installed }, purchases, gifts7, coinGifts7, giftsToday, totals, reconcile] = await Promise.all([
      allItemsWithMerch(campaigns, now),
      store.purchasesSince(since14).catch(() => []),
      count(supabase.from("user_inventory").select("id", { count: "exact", head: true }).eq("acquired_via", "gift").gte("acquired_at", since7)),
      count(supabase.from("descoin_ledger").select("id", { count: "exact", head: true }).eq("reason", "admin_grant").gte("created_at", since7)),
      count(supabase.from("user_inventory").select("id", { count: "exact", head: true }).eq("acquired_via", "gift").gte("acquired_at", dayStart)),
      circulating(),
      latestReconcile(),
    ]);
    const { byItem, totals: sales, days } = salesStats(purchases, now);
    const sold = (id) => byItem.get(String(id)) || { n7: 0, prev7: 0, revenue7: 0, series: days.map(() => 0) };
    const outItems = items.map((it) => ({ ...it, sales: sold(it.id) }));
    const visible = outItems.filter((it) => !it.retired);
    const activeCampaigns = campaigns.filter((c) => merch.campaignStatus(c, now) === "active");
    const nearest = [...activeCampaigns].sort((a, b) => Date.parse(a.ends_at) - Date.parse(b.ends_at))[0] || null;
    const limited = visible.filter((it) => it.active && it.availability.state === "live" && (it.availability.stockLeft != null || it.availability.endsAt));
    res.json({
      serverTime: new Date(now).toISOString(),
      installed: { merch: installed, campaigns: campaignsInstalled, sections: sectionsInstalled },
      days,
      items: outItems,
      campaigns: campaigns.map((c) => ({ ...c, status: merch.campaignStatus(c, now) })),
      sections,
      kpis: {
        activeItems: visible.filter((it) => it.active).length,
        totalItems: visible.length,
        inactiveItems: visible.filter((it) => !it.active).length,
        retiredItems: outItems.length - visible.length,
        sales7: sales.n7,
        salesPrev7: sales.prev7,
        spent7: sales.spent7,
        avg7: sales.n7 ? Math.round(sales.spent7 / sales.n7) : 0,
        salesToday: sales.today,
        spentToday: sales.spentToday,
        salesSeries: sales.series,
        gifts7: gifts7 == null ? null : gifts7 + (coinGifts7 || 0),
        giftItems7: gifts7,
        giftCoins7: coinGifts7,
        giftsToday,
        activeCampaigns: activeCampaigns.length,
        nearestCampaign: nearest ? { id: nearest.id, name: nearest.name, endsAt: nearest.ends_at } : null,
        limited: limited.length,
        circulating: totals.circulating,
        holders: totals.holders,
      },
      reconcile,
    });
  } catch (err) {
    fail(res, err, "failed_to_load_the_shop_desk");
  }
});

/** User search for the quick panel and gift picker (balance + frozen included). */
router.get("/shop/desk/users", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const q = String(req.query.q || "").trim().replace(/^@/, "").replace(/[%_,()]/g, "").slice(0, 40);
    if (!q) return res.json({ users: [] });
    let query = supabase.from("users").select("id, username, display_name, avatar_url, descoin_balance, descoin_frozen, is_admin").limit(8);
    query = UUID.test(q) ? query.eq("id", q) : query.or(`username.ilike.${q}%,display_name.ilike.%${q}%`);
    const users = await rows(query.order("username", { ascending: true }));
    res.json({
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.display_name || u.username,
        avatarUrl: u.avatar_url || null,
        balance: Number(u.descoin_balance) || 0,
        frozen: Boolean(u.descoin_frozen),
        isAdmin: Boolean(u.is_admin) || u.username === "admin",
      })),
    });
  } catch (err) {
    fail(res, err, "user_search_failed");
  }
});

/** How many people own any of these items (bulk price warning). */
router.get("/shop/desk/owners-count", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const ids = merch.cleanIds(String(req.query.ids || "").split(","), 200);
    if (!ids.length) return res.json({ owners: 0 });
    const n = await count(supabase.from("user_inventory").select("id", { count: "exact", head: true }).in("item_id", ids));
    res.json({ owners: n });
  } catch (err) {
    fail(res, err, "failed_to_count_owners");
  }
});

/* ======================================================================== one item */

router.get("/shop/items/:id/detail", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const id = req.params.id;
    if (!UUID.test(id)) throw bad("not_found", 404);
    const now = Date.now();
    const days = Math.max(7, Math.min(90, parseInt(req.query.days, 10) || 30));
    const item = await shop.getItemById(id);
    if (!item) throw bad("not_found", 404);
    const [{ merch: m }, { campaigns }, { sections }] = await Promise.all([store.freshItemMerch(id), allCampaigns(), allSections()]);
    const full = m ? { ...item, ...m, id: item.id } : item;
    const purchases = await store.purchasesSince(new Date(now - days * merch.DAY_MS).toISOString(), { itemId: id }).catch(() => []);
    const dayKeys = merch.lastDays(days, now);
    const idx = new Map(dayKeys.map((d, i) => [d, i]));
    const series = dayKeys.map(() => 0);
    const revenueSeries = dayKeys.map(() => 0);
    let revenue = 0;
    for (const p of purchases) {
      const k = idx.get(merch.trDay(p.created_at));
      if (k != null) {
        series[k] += 1;
        revenueSeries[k] += Number(p.amount_descoin) || 0;
      }
      revenue += Number(p.amount_descoin) || 0;
    }
    const recent = purchases.slice(0, 20);
    const buyerIds = [...new Set(recent.map((p) => p.user_id))];
    const buyers = buyerIds.length ? await rows(supabase.from("users").select("id, username, display_name, avatar_url").in("id", buyerIds)) : [];
    const buyerById = new Map(buyers.map((u) => [u.id, u]));
    const [owners, ownersGift, ownersPurchase] = await Promise.all([
      count(supabase.from("user_inventory").select("id", { count: "exact", head: true }).eq("item_id", id)),
      count(supabase.from("user_inventory").select("id", { count: "exact", head: true }).eq("item_id", id).eq("acquired_via", "gift")),
      count(supabase.from("user_inventory").select("id", { count: "exact", head: true }).eq("item_id", id).eq("acquired_via", "purchase")),
    ]);
    const history = await require("../lib/adminAuditStore").list({ target: id, limit: 50 });
    const memory = (state.auditLog || []).filter((e) => String(e?.target) === String(id)).slice(0, 50);
    res.json({
      item: {
        ...full,
        retired: shop.RETIRED_SHOP_CATEGORIES.has(full.category),
        pricing: merch.effectivePricing(full, campaigns, now),
        availability: merch.availability(full, campaigns, now),
      },
      sales: {
        days: dayKeys,
        series,
        revenueSeries,
        total: purchases.length,
        revenue,
        recent: recent.map((p) => {
          const u = buyerById.get(p.user_id);
          return { id: p.id, at: p.created_at, amount: Number(p.amount_descoin) || 0, user: u ? { id: u.id, username: u.username, displayName: u.display_name || u.username, avatarUrl: u.avatar_url || null } : null };
        }),
      },
      owners: { total: owners, gift: ownersGift, purchase: ownersPurchase },
      campaigns: campaigns.filter((c) => merch.campaignCoversItem(c, full)).map((c) => ({ ...c, status: merch.campaignStatus(c, now) })),
      sectionIds: sections.filter((s) => (s.item_ids || []).map(String).includes(String(id))).map((s) => s.id),
      history: (history || memory).map((e) => ({ id: e.id, at: e.at, actor: e.actorUsername, action: e.action, meta: e.meta || {} })),
    });
  } catch (err) {
    fail(res, err, "failed_to_load_the_item");
  }
});

router.get("/shop/items/:id/owners", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const id = req.params.id;
    if (!UUID.test(id)) throw bad("not_found", 404);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 50));
    const inv = await rows(
      supabase.from("user_inventory").select("id, user_id, acquired_via, gifted_by, acquired_at").eq("item_id", id).order("acquired_at", { ascending: false }).limit(limit)
    );
    const ids = [...new Set(inv.flatMap((r) => [r.user_id, r.gifted_by]).filter(Boolean))];
    const users = ids.length ? await rows(supabase.from("users").select("id, username, display_name, avatar_url").in("id", ids)) : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    const pick = (uid) => {
      const u = byId.get(uid);
      return u ? { id: u.id, username: u.username, displayName: u.display_name || u.username, avatarUrl: u.avatar_url || null } : null;
    };
    res.json({ owners: inv.map((r) => ({ id: r.id, via: r.acquired_via, at: r.acquired_at, user: pick(r.user_id), giftedBy: r.gifted_by ? pick(r.gifted_by) : null })) });
  } catch (err) {
    fail(res, err, "failed_to_load_owners");
  }
});

const BASE_FIELDS = {
  name: (v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : undefined),
  description: (v) => (v == null ? null : String(v).trim().slice(0, 300) || null),
  active: (v) => Boolean(v),
  priceDescoin: (v) => Math.max(0, Math.min(10_000_000, Math.round(Number(v) || 0))),
  rarity: (v) => (["common", "rare", "epic", "legendary", "mythic"].includes(v) ? v : undefined),
  assetUrl: (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined),
  previewUrl: (v) => (v == null ? null : String(v).trim() || null),
  effectKey: (v) => (v == null ? null : String(v).trim().slice(0, 60) || null),
  themeKey: (v) => (v == null ? null : String(v).trim().slice(0, 60) || null),
  sortOrder: (v) => Math.round(Number(v) || 0),
};
const BASE_COLUMN = {
  name: "name",
  description: "description",
  active: "active",
  priceDescoin: "price_descoin",
  rarity: "rarity",
  assetUrl: "asset_url",
  previewUrl: "preview_url",
  effectKey: "effect_key",
  themeKey: "theme_key",
  sortOrder: "sort_order",
};

function diff(before, after) {
  const out = {};
  for (const [k, v] of Object.entries(after)) {
    if (k === "asset_url" || k === "preview_url") {
      if (before?.[k] !== v) out[k] = { changed: true };
      continue;
    }
    const prev = before ? before[k] ?? null : null;
    if (JSON.stringify(prev) !== JSON.stringify(v ?? null)) out[k] = { from: prev, to: v ?? null };
  }
  return out;
}

async function writeUpdate(req, kind, itemIds) {
  try {
    await supabase.from("shop_updates").insert({ body: kind, item_ids: itemIds.slice(0, 60), created_by: req.user.id });
  } catch {
    /* optional feed */
  }
}

async function setSectionMembership(itemId, sectionIds) {
  const { sections, installed } = await allSections();
  if (!installed) return [];
  const want = new Set((sectionIds || []).map(String));
  const changed = [];
  for (const s of sections) {
    if (s.kind !== "manual") continue;
    const ids = (s.item_ids || []).map(String);
    const has = ids.includes(String(itemId));
    if (want.has(String(s.id)) && !has) {
      await rows(supabase.from("shop_storefront_sections").update({ item_ids: [...ids, String(itemId)], updated_at: new Date().toISOString() }).eq("id", s.id).select("id"));
      changed.push(s.id);
    } else if (!want.has(String(s.id)) && has) {
      await rows(supabase.from("shop_storefront_sections").update({ item_ids: ids.filter((x) => x !== String(itemId)), updated_at: new Date().toISOString() }).eq("id", s.id).select("id"));
      changed.push(s.id);
    }
  }
  return changed;
}

/** Drawer save: base fields + stock / time / sale + storefront membership, one audit row. */
router.patch("/shop/desk/items/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!UUID.test(id)) throw bad("not_found", 404);
    const before = await shop.getItemById(id);
    if (!before) throw bad("not_found", 404);
    const body = req.body || {};
    const base = {};
    for (const [key, clean] of Object.entries(BASE_FIELDS)) {
      if (body[key] === undefined) continue;
      const v = clean(body[key]);
      if (v !== undefined) base[BASE_COLUMN[key]] = v;
    }
    const m = merch.validateMerchPatch(body);
    if (!m.ok) throw bad(m.error);
    const { merch: merchBefore, installed } = await store.freshItemMerch(id);
    if (Object.keys(m.row).length && !installed) throw bad("not_installed", 503);
    if (m.row.stock_limit != null && merchBefore && Number(merchBefore.stock_sold) > m.row.stock_limit) {
      throw bad("stock_below_sold");
    }
    let item = before;
    if (Object.keys(base).length) item = await shop.updateItem(id, base);
    if (Object.keys(m.row).length) {
      await rows(supabase.from("shop_items").update({ ...m.row, updated_at: new Date().toISOString() }).eq("id", id).select("id"));
    }
    let sectionsChanged = [];
    if (Array.isArray(body.sectionIds)) sectionsChanged = await setSectionMembership(id, merch.cleanIds(body.sectionIds, 20));
    const changes = { ...diff(before, base), ...diff(merchBefore || {}, m.row) };
    if (sectionsChanged.length) changes.sections = { to: body.sectionIds };
    audit(req, "shop_item_update", id, { sku: before.sku, changes, reason: cleanReason(body.reason) || null });
    if (body.announce && (base.price_descoin != null || m.row.sale_pct)) await writeUpdate(req, base.price_descoin < before.price_descoin || m.row.sale_pct ? "price_drop" : "price_change", [id]);
    shopChanged(req, { reason: "item", itemId: id });
    res.json({ ok: true, item });
  } catch (err) {
    fail(res, err, "failed_to_save_the_item");
  }
});

/* ======================================================================== bulk */

const BULK_ACTIONS = ["activate", "deactivate", "price", "sale", "clear_sale", "section_add", "stock"];

router.post("/shop/desk/bulk", async (req, res) => {
  try {
    const body = req.body || {};
    const action = String(body.action || "");
    if (!BULK_ACTIONS.includes(action)) throw bad("bad_action");
    const ids = merch.cleanIds(body.itemIds, 1000);
    if (!ids.length) throw bad("no_items");
    const reason = cleanReason(body.reason);
    if (["price", "sale"].includes(action) && reason.length < 3) throw bad("reason_required");
    const items = await rows(supabase.from("shop_items").select("id, sku, name, category, price_descoin, active").in("id", ids));
    const editable = items.filter((it) => !shop.RETIRED_SHOP_CATEGORIES.has(it.category));
    const nowIso = new Date().toISOString();
    const changes = [];
    if (action === "activate" || action === "deactivate") {
      const active = action === "activate";
      editable.forEach((it) => changes.push({ id: it.id, sku: it.sku, from: Boolean(it.active), to: active }));
      await rows(supabase.from("shop_items").update({ active }).in("id", editable.map((it) => it.id)).select("id"));
    } else if (action === "price") {
      const op = { type: body.op?.type, value: body.op?.value, rounding: body.op?.rounding || "none" };
      if (editable.some((it) => merch.applyPriceOp(it.price_descoin, op) == null)) throw bad("bad_op");
      for (const it of editable) {
        const from = Number(it.price_descoin) || 0;
        const next = merch.applyPriceOp(from, op);
        if (next == null) throw bad("bad_op");
        if (next === from) continue;
        await rows(supabase.from("shop_items").update({ price_descoin: next }).eq("id", it.id).select("id"));
        changes.push({ id: it.id, sku: it.sku, from, to: next });
      }
    } else if (action === "sale" || action === "clear_sale") {
      const m = action === "sale"
        ? merch.validateMerchPatch({ salePct: body.sale?.pct, saleStartsAt: body.sale?.startsAt ?? null, saleEndsAt: body.sale?.endsAt ?? null })
        : { ok: true, row: { sale_pct: null, sale_starts_at: null, sale_ends_at: null } };
      if (!m.ok) throw bad(m.error);
      if (action === "sale" && !m.row.sale_pct) throw bad("pct_required");
      const { error } = await supabase.from("shop_items").update({ ...m.row, updated_at: nowIso }).in("id", editable.map((it) => it.id)).select("id");
      if (error) {
        if (store.isMissing(error)) throw bad("not_installed", 503);
        throw error;
      }
      editable.forEach((it) => changes.push({ id: it.id, sku: it.sku, sale: m.row }));
    } else if (action === "stock") {
      const m = merch.validateMerchPatch({ stockLimit: body.stockLimit ?? null, availableUntil: body.availableUntil });
      if (!m.ok) throw bad(m.error);
      const { error } = await supabase.from("shop_items").update({ ...m.row, updated_at: nowIso }).in("id", editable.map((it) => it.id)).select("id");
      if (error) {
        if (store.isMissing(error)) throw bad("not_installed", 503);
        throw error;
      }
      editable.forEach((it) => changes.push({ id: it.id, sku: it.sku, stock: m.row }));
    } else if (action === "section_add") {
      const sectionId = String(body.sectionId || "");
      if (!UUID.test(sectionId)) throw bad("section_required");
      const { data: s, error } = await supabase.from("shop_storefront_sections").select("id, kind, item_ids").eq("id", sectionId).maybeSingle();
      if (error) throw store.isMissing(error) ? bad("not_installed", 503) : error;
      if (!s || s.kind !== "manual") throw bad("section_not_manual");
      const merged = [...new Set([...(s.item_ids || []).map(String), ...editable.map((it) => String(it.id))])].slice(0, 60);
      await rows(supabase.from("shop_storefront_sections").update({ item_ids: merged, updated_at: nowIso }).eq("id", sectionId).select("id"));
      editable.forEach((it) => changes.push({ id: it.id, sku: it.sku, section: sectionId }));
    }
    audit(req, `shop_bulk_${action}`, null, { count: changes.length, reason: reason || null, op: body.op || body.sale || null, items: changes.slice(0, 100) });
    if (body.announce && changes.length && ["price", "sale"].includes(action)) {
      const dropped = action === "sale" || changes.every((c) => c.to == null || c.to < c.from);
      await writeUpdate(req, dropped ? "price_drop" : "price_change", changes.map((c) => c.id));
    }
    if (changes.length) shopChanged(req, { reason: `bulk_${action}`, count: changes.length });
    res.json({ ok: true, changed: changes.length, skipped: ids.length - changes.length, changes });
  } catch (err) {
    fail(res, err, "bulk_change_failed");
  }
});

/* ======================================================================== campaigns */

router.get("/shop/campaigns", async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const now = Date.now();
    const { campaigns, installed } = await allCampaigns();
    res.json({ installed, campaigns: campaigns.map((c) => ({ ...c, status: merch.campaignStatus(c, now) })) });
  } catch (err) {
    fail(res, err, "failed_to_load_campaigns");
  }
});

async function applyDropStock(campaign, stockPerItem) {
  const n = Math.round(Number(stockPerItem));
  if (!Number.isFinite(n) || n <= 0 || campaign.kind !== "drop") return 0;
  const ids = merch.cleanIds(campaign.scope?.itemIds || []);
  if (!ids.length) return 0;
  await rows(supabase.from("shop_items").update({ stock_limit: n, updated_at: new Date().toISOString() }).in("id", ids).select("id"));
  return ids.length;
}

router.post("/shop/campaigns", async (req, res) => {
  try {
    const v = merch.validateCampaign(req.body || {});
    if (!v.ok) throw bad(v.error);
    const { data, error } = await supabase.from("shop_campaigns").insert({ ...v.row, created_by: req.user.id }).select("*").maybeSingle();
    if (error) throw store.isMissing(error) ? bad("not_installed", 503) : error;
    const stocked = await applyDropStock(data, req.body?.stockPerItem).catch(() => 0);
    audit(req, "shop_campaign_create", data.id, { name: data.name, kind: data.kind, pct: data.discount_pct, startsAt: data.starts_at, endsAt: data.ends_at, scope: data.scope, stocked });
    shopChanged(req, { reason: "campaign" });
    res.json({ ok: true, campaign: { ...data, status: merch.campaignStatus(data) } });
  } catch (err) {
    fail(res, err, "failed_to_create_the_campaign");
  }
});

router.patch("/shop/campaigns/:id", async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) throw bad("not_found", 404);
    const { data: before, error: e1 } = await supabase.from("shop_campaigns").select("*").eq("id", req.params.id).maybeSingle();
    if (e1) throw store.isMissing(e1) ? bad("not_installed", 503) : e1;
    if (!before) throw bad("not_found", 404);
    const merged = { ...req.body };
    if (merged.kind === undefined) merged.kind = before.kind;
    const v = merch.validateCampaign(merged, { partial: true });
    if (!v.ok) throw bad(v.error);
    const next = { ...before, ...v.row };
    if (Date.parse(next.ends_at) <= Date.parse(next.starts_at)) throw bad("bad_window");
    const { data, error } = await supabase.from("shop_campaigns").update({ ...v.row, updated_at: new Date().toISOString() }).eq("id", req.params.id).select("*").maybeSingle();
    if (error) throw error;
    audit(req, "shop_campaign_update", req.params.id, { name: data.name, changes: diff(before, v.row) });
    shopChanged(req, { reason: "campaign" });
    res.json({ ok: true, campaign: { ...data, status: merch.campaignStatus(data) } });
  } catch (err) {
    fail(res, err, "failed_to_save_the_campaign");
  }
});

router.delete("/shop/campaigns/:id", async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) throw bad("not_found", 404);
    const { data, error } = await supabase.from("shop_campaigns").delete().eq("id", req.params.id).select("id, name, kind");
    if (error) throw store.isMissing(error) ? bad("not_installed", 503) : error;
    if (!data?.length) throw bad("not_found", 404);
    audit(req, "shop_campaign_delete", req.params.id, { name: data[0].name, kind: data[0].kind });
    shopChanged(req, { reason: "campaign" });
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, "failed_to_delete_the_campaign");
  }
});

/* ======================================================================== storefront sections */

router.get("/shop/sections", async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const { sections, installed } = await allSections();
    res.json({ installed, sections });
  } catch (err) {
    fail(res, err, "failed_to_load_storefront_sections");
  }
});

/** What each section shows right now (for the admin list thumbnails and rotation info). */
router.get("/shop/sections/preview", async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const now = Date.now();
    const [{ sections }, { campaigns }] = await Promise.all([allSections(), allCampaigns()]);
    const { items } = await allItemsWithMerch(campaigns, now);
    const listed = items
      .filter((it) => it.active && !it.retired && merch.isListed(it.availability))
      .map((it) => ({ ...it, ...merch.merchFields(it, campaigns, now) }));
    const sales = await store.salesByItem(7);
    const out = {};
    for (const s of sections) {
      const resolved = merch.resolveSections([{ ...s, enabled: true, visible_from: null, visible_until: null }], listed, { now, salesByItem: sales, campaigns: [] })[0];
      let poolSize = null;
      let repeatFreeWeeks = null;
      if (s.kind === "rotating") {
        const cfg = s.config || {};
        const pool = listed.filter((it) => (!cfg.rarities?.length || cfg.rarities.includes(it.rarity)) && (!cfg.categories?.length || cfg.categories.includes(it.category)));
        poolSize = pool.length;
        repeatFreeWeeks = merch.rotationPick(pool.map((it) => it.id), cfg.count || 8, 0, s.id).repeatFreeWeeks;
      }
      out[s.id] = {
        itemIds: resolved ? resolved.itemIds : [],
        total: resolved ? resolved.itemIds.length : 0,
        nextRotationAt: resolved?.nextRotationAt || null,
        endsAt: resolved?.endsAt || null,
        live: merch.sectionVisible(s, campaigns, now),
        poolSize,
        repeatFreeWeeks,
      };
    }
    res.json({ preview: out });
  } catch (err) {
    fail(res, err, "failed_to_preview_the_storefront");
  }
});

router.post("/shop/sections", async (req, res) => {
  try {
    const v = merch.validateSection(req.body || {});
    if (!v.ok) throw bad(v.error);
    const { sections, installed } = await allSections();
    if (!installed) throw bad("not_installed", 503);
    const sortOrder = sections.reduce((m, s) => Math.max(m, s.sort_order || 0), 0) + 10;
    const { data, error } = await supabase.from("shop_storefront_sections").insert({ sort_order: sortOrder, enabled: true, item_ids: [], config: {}, ...v.row, created_by: req.user.id }).select("*").maybeSingle();
    if (error) throw error;
    audit(req, "shop_section_create", data.id, { title: data.title, kind: data.kind });
    shopChanged(req, { reason: "section" });
    res.json({ ok: true, section: data });
  } catch (err) {
    fail(res, err, "failed_to_create_the_section");
  }
});

router.post("/shop/sections/order", async (req, res) => {
  try {
    const ids = merch.cleanIds(req.body?.ids, 100);
    if (!ids.length) throw bad("no_items");
    for (let i = 0; i < ids.length; i += 1) {
      const { error } = await supabase.from("shop_storefront_sections").update({ sort_order: (i + 1) * 10, updated_at: new Date().toISOString() }).eq("id", ids[i]);
      if (error) throw store.isMissing(error) ? bad("not_installed", 503) : error;
    }
    audit(req, "shop_section_reorder", null, { ids });
    shopChanged(req, { reason: "section" });
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, "failed_to_reorder_sections");
  }
});

router.patch("/shop/sections/:id", async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) throw bad("not_found", 404);
    const v = merch.validateSection(req.body || {}, { partial: true });
    if (!v.ok) throw bad(v.error);
    const { data, error } = await supabase.from("shop_storefront_sections").update({ ...v.row, updated_at: new Date().toISOString() }).eq("id", req.params.id).select("*").maybeSingle();
    if (error) throw store.isMissing(error) ? bad("not_installed", 503) : error;
    if (!data) throw bad("not_found", 404);
    audit(req, "shop_section_update", req.params.id, { title: data.title, fields: Object.keys(v.row) });
    shopChanged(req, { reason: "section" });
    res.json({ ok: true, section: data });
  } catch (err) {
    fail(res, err, "failed_to_save_the_section");
  }
});

router.delete("/shop/sections/:id", async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) throw bad("not_found", 404);
    const { data, error } = await supabase.from("shop_storefront_sections").delete().eq("id", req.params.id).select("id, title");
    if (error) throw store.isMissing(error) ? bad("not_installed", 503) : error;
    if (!data?.length) throw bad("not_found", 404);
    audit(req, "shop_section_delete", req.params.id, { title: data[0].title });
    shopChanged(req, { reason: "section" });
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, "failed_to_delete_the_section");
  }
});

/* ======================================================================== analytics */

router.get("/shop/analytics", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const now = Date.now();
    const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const purchases = await store.purchasesSince(new Date(now - days * merch.DAY_MS).toISOString());
    const items = await shop.listAllItems();
    const itemById = new Map(items.map((it) => [String(it.id), it]));
    const dayKeys = merch.lastDays(days, now);
    const idx = new Map(dayKeys.map((d, i) => [d, i]));
    const count7 = dayKeys.map(() => 0);
    const revenue = dayKeys.map(() => 0);
    const byItem = new Map();
    const byCategory = new Map();
    const buyers = new Set();
    let discounted = 0;
    for (const p of purchases) {
      const k = idx.get(merch.trDay(p.created_at));
      const amt = Number(p.amount_descoin) || 0;
      if (k != null) {
        count7[k] += 1;
        revenue[k] += amt;
      }
      buyers.add(p.user_id);
      const it = itemById.get(String(p.item_id));
      if (it && amt < Number(it.price_descoin)) discounted += 1;
      const s = byItem.get(String(p.item_id)) || { n: 0, revenue: 0 };
      s.n += 1;
      s.revenue += amt;
      byItem.set(String(p.item_id), s);
      const cat = it?.category || "other";
      const c = byCategory.get(cat) || { n: 0, revenue: 0 };
      c.n += 1;
      c.revenue += amt;
      byCategory.set(cat, c);
    }
    const top = [...byItem.entries()]
      .sort((a, b) => b[1].n - a[1].n || b[1].revenue - a[1].revenue)
      .slice(0, 12)
      .map(([id, s]) => {
        const it = itemById.get(id);
        return { id, n: s.n, revenue: s.revenue, name: it?.name || id, sku: it?.sku || null, category: it?.category || null, rarity: it?.rarity || null, effect_key: it?.effect_key || null, theme_key: it?.theme_key || null, asset_url: shop.IMAGE_ASSET_CATEGORIES.has(it?.category) ? it.asset_url : null, preview_url: shop.IMAGE_ASSET_CATEGORIES.has(it?.category) ? it.preview_url : null, country_code: it?.country_code || null };
      });
    res.json({
      days: dayKeys,
      count: count7,
      revenue,
      total: purchases.length,
      totalRevenue: revenue.reduce((a, b) => a + b, 0),
      buyers: buyers.size,
      discounted,
      top,
      categories: [...byCategory.entries()].map(([category, s]) => ({ category, ...s })).sort((a, b) => b.revenue - a.revenue),
    });
  } catch (err) {
    fail(res, err, "failed_to_load_sales_analytics");
  }
});

/* ======================================================================== gifts (casino) */

function userCard(u) {
  return u ? { id: u.id, username: u.username, displayName: u.display_name || u.username, avatarUrl: u.avatar_url || null } : null;
}

router.get("/shop/gifts", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 60));
    const inv = await rows(
      supabase.from("user_inventory").select("id, user_id, item_id, gifted_by, gift_message, acquired_at, notified_at").eq("acquired_via", "gift").order("acquired_at", { ascending: false }).limit(limit)
    );
    const userIds = [...new Set(inv.flatMap((r) => [r.user_id, r.gifted_by]).filter(Boolean))];
    const itemIds = [...new Set(inv.map((r) => r.item_id))];
    const [users, items] = await Promise.all([
      userIds.length ? rows(supabase.from("users").select(`id, username, display_name, avatar_url, ${Object.values(shop.EQUIP_COLUMN_BY_CATEGORY).join(", ")}`).in("id", userIds)) : [],
      itemIds.length ? rows(supabase.from("shop_items").select("id, sku, name, category, rarity, effect_key, theme_key, price_descoin, country_code, asset_url, preview_url").in("id", itemIds)) : [],
    ]);
    const uById = new Map(users.map((u) => [u.id, u]));
    const iById = new Map(items.map((i) => [i.id, i]));
    const since7 = Date.now() - 7 * merch.DAY_MS;
    res.json({
      gifts: inv.map((r) => {
        const it = iById.get(r.item_id);
        const u = uById.get(r.user_id);
        const col = it ? shop.EQUIP_COLUMN_BY_CATEGORY[it.category] : null;
        return {
          id: r.id,
          at: r.acquired_at,
          message: r.gift_message || null,
          seen: Boolean(r.notified_at),
          equipped: Boolean(col && u && String(u[col] || "") === String(r.item_id)),
          user: userCard(u),
          by: userCard(uById.get(r.gifted_by)),
          item: it ? { ...it, asset_url: shop.IMAGE_ASSET_CATEGORIES.has(it.category) ? it.asset_url : null, preview_url: shop.IMAGE_ASSET_CATEGORIES.has(it.category) ? it.preview_url : null } : null,
        };
      }),
      count7: inv.filter((r) => Date.parse(r.acquired_at) >= since7).length,
    });
  } catch (err) {
    fail(res, err, "failed_to_load_gift_history");
  }
});

/** Gift one item to several users at once (already owned = skipped). */
router.post("/shop/gifts", async (req, res) => {
  try {
    const { itemId, message } = req.body || {};
    const userIds = merch.cleanIds(req.body?.userIds, 50);
    if (!UUID.test(String(itemId || "")) || !userIds.length) throw bad("bad_request");
    const item = await shop.getItemById(itemId);
    if (!item) throw bad("not_found", 404);
    if (shop.REMOVED_COSMETIC_CATEGORIES.has(item.category)) throw bad("cosmetic_removed", 410);
    const note = typeof message === "string" && message.trim() ? message.trim().slice(0, 280) : null;
    const users = await rows(supabase.from("users").select("id, username").in("id", userIds));
    const io = getIo(req);
    const granted = [];
    const skipped = [];
    for (const u of users) {
      if (await shop.userOwnsItem(u.id, item.id)) {
        skipped.push({ id: u.id, username: u.username, reason: "owned" });
        continue;
      }
      const row = await shop.grantItem(u.id, item.id, { acquiredVia: "gift", giftedBy: req.user.id, giftMessage: note });
      if (!row) {
        skipped.push({ id: u.id, username: u.username, reason: "owned" });
        continue;
      }
      granted.push({ id: u.id, username: u.username, inventoryId: row.id });
      const online = Boolean(io?.sockets?.adapter?.rooms?.get(`user:${u.id}`)?.size);
      if (io && online) {
        io.to(`user:${u.id}`).emit("shop:gift:received", { item, message: note, from: { id: req.user.id, username: req.user.username } });
        await shop.markGiftsNotified([row.id]).catch(() => {});
      }
    }
    for (const g of granted) audit(req, "shop_gift", g.id, { itemId: item.id, sku: item.sku, message: note, inventoryId: g.inventoryId, multi: granted.length > 1 });
    if (io) notifyAdminRoom(io, { type: "shop_gift", count: granted.length });
    res.json({ ok: true, granted, skipped, missing: userIds.length - users.length });
  } catch (err) {
    fail(res, err, "failed_to_send_the_gift");
  }
});

/** Undo a gift: remove the inventory row and take it off if it is worn. */
router.delete("/shop/gifts/:inventoryId", async (req, res) => {
  try {
    const invId = req.params.inventoryId;
    if (!UUID.test(invId)) throw bad("not_found", 404);
    const { data: row, error } = await supabase.from("user_inventory").select("id, user_id, item_id, acquired_via, gifted_by, acquired_at").eq("id", invId).maybeSingle();
    if (error) throw error;
    if (!row || row.acquired_via !== "gift") throw bad("not_found", 404);
    const item = await shop.getItemById(row.item_id);
    const column = item ? shop.EQUIP_COLUMN_BY_CATEGORY[item.category] : null;
    let unequipped = false;
    if (column) {
      const { data: worn } = await supabase.from("users").update({ [column]: null }).eq("id", row.user_id).eq(column, row.item_id).select("id");
      unequipped = Boolean(worn && worn.length);
    }
    const { error: delErr } = await supabase.from("user_inventory").delete().eq("id", invId).eq("acquired_via", "gift");
    if (delErr) throw delErr;
    audit(req, "shop_gift_undo", row.user_id, { itemId: row.item_id, sku: item?.sku || null, inventoryId: invId, giftedAt: row.acquired_at, unequipped, reason: cleanReason(req.body?.reason) || null });
    const io = getIo(req);
    if (io) {
      io.to(`user:${row.user_id}`).emit("shop:inventory:changed", { removed: row.item_id });
      if (unequipped) {
        io.to(`user:${row.user_id}`).emit("shop:equipped", { category: item.category, itemId: null });
        try {
          await require("../lib/userProfile").broadcastUserProfileUpdate(io, row.user_id);
        } catch {
          /* profile refreshes on next load */
        }
      }
      notifyAdminRoom(io, { type: "shop_gift_undo", userId: row.user_id });
    }
    res.json({ ok: true, unequipped });
  } catch (err) {
    fail(res, err, "failed_to_undo_the_gift");
  }
});

/* ======================================================================== DesCoin (casino) */

router.get("/descoin/ops", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 60));
    const led = await rows(
      supabase.from("descoin_ledger").select("id, user_id, amount, reason, meta, balance_after, message, notified_at, created_at").in("reason", ["admin_grant", "admin_revoke", "reconcile_adjust"]).order("created_at", { ascending: false }).limit(limit)
    );
    const ids = [...new Set(led.flatMap((r) => [r.user_id, r.meta?.by]).filter((x) => UUID.test(String(x || ""))))];
    const users = ids.length ? await rows(supabase.from("users").select("id, username, display_name, avatar_url").in("id", ids)) : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    const since7 = Date.now() - 7 * merch.DAY_MS;
    const week = led.filter((r) => Date.parse(r.created_at) >= since7);
    res.json({
      ops: led.map((r) => ({
        id: r.id,
        at: r.created_at,
        amount: r.amount,
        reason: r.reason,
        note: r.meta?.reason || null,
        message: r.message || null,
        balanceAfter: r.balance_after,
        user: userCard(byId.get(r.user_id)),
        by: userCard(byId.get(r.meta?.by)),
      })),
      week: {
        given: week.filter((r) => r.amount > 0 && r.reason === "admin_grant").reduce((a, r) => a + r.amount, 0),
        taken: week.filter((r) => r.amount < 0 && r.reason === "admin_revoke").reduce((a, r) => a - r.amount, 0),
        count: week.length,
      },
    });
  } catch (err) {
    fail(res, err, "failed_to_load_descoin_operations");
  }
});

async function ledgerSummary(userId) {
  let sum = 0;
  let n = 0;
  for (let from = 0; from < 200_000; from += PAGE) {
    const page = await rows(supabase.from("descoin_ledger").select("amount").eq("user_id", userId).range(from, from + PAGE - 1));
    for (const r of page) {
      sum += Number(r.amount) || 0;
      n += 1;
    }
    if (page.length < PAGE) break;
  }
  return { sum, n };
}

async function reconcileUser(userId) {
  const { data: u, error } = await supabase.from("users").select("id, username, display_name, avatar_url, created_at, email_confirmed_at, descoin_balance, descoin_frozen").eq("id", userId).maybeSingle();
  if (error) throw error;
  if (!u) throw bad("not_found", 404);
  const [{ sum, n }, recent] = await Promise.all([
    ledgerSummary(userId),
    rows(supabase.from("descoin_ledger").select("id, amount, reason, meta, balance_after, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(30)),
  ]);
  let actions = [];
  try {
    const { data } = await supabase.from("descoin_reconcile_actions").select("id, mode, drift, balance_before, balance_after, reason, admin_id, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(10);
    actions = data || [];
  } catch {
    actions = [];
  }
  const balance = Number(u.descoin_balance) || 0;
  return {
    user: {
      ...userCard(u),
      createdAt: u.created_at,
      emailVerified: Boolean(u.email_confirmed_at),
      frozen: Boolean(u.descoin_frozen),
    },
    balance,
    ledgerSum: sum,
    ledgerRows: n,
    drift: balance - sum,
    recent: recent.map((r) => ({ id: r.id, at: r.created_at, reason: r.reason, amount: r.amount, balanceAfter: r.balance_after })),
    gap: merch.ledgerGap(recent, balance),
    actions,
  };
}

router.get("/descoin/users/:id/reconcile", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    if (!UUID.test(req.params.id)) throw bad("not_found", 404);
    res.json(await reconcileUser(req.params.id));
  } catch (err) {
    fail(res, err, "failed_to_check_this_user");
  }
});

/** "Yalnızca bu kullanıcıyı kontrol et": a fresh single-user comparison, audited. */
router.post("/descoin/users/:id/check", async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) throw bad("not_found", 404);
    const out = await reconcileUser(req.params.id);
    audit(req, "descoin_reconcile_check", req.params.id, { drift: out.drift, balance: out.balance, ledgerSum: out.ledgerSum });
    res.json(out);
  } catch (err) {
    fail(res, err, "failed_to_check_this_user");
  }
});

// Popup text for "Kullanıcıya bildirim göster" per UI language (data file, not code copy).
const NOTIFY_TEXT = require("../lib/shopDeskNotify.json");

/**
 * Close a reconciliation gap.
 *   balance_to_ledger  balance := ledger sum (no ledger row; the ledger is right)
 *   ledger_to_balance  one reconcile_adjust ledger row of `drift` (balance unchanged)
 *   note               nothing changes, the decision is logged
 * `expectedDrift` must match the fresh numbers (someone else may have fixed it already).
 */
router.post("/descoin/reconciliation/fix", async (req, res) => {
  try {
    const { userId, mode, expectedDrift, runId } = req.body || {};
    if (!UUID.test(String(userId || ""))) throw bad("not_found", 404);
    if (!merch.FIX_MODES.includes(mode)) throw bad("bad_mode");
    const reason = cleanReason(req.body?.reason, 500);
    if (reason.length < 3) throw bad("reason_required");
    const result = await descoin.runSerialized(userId, async () => {
      const fresh = await reconcileUser(userId);
      if (expectedDrift != null && Number(expectedDrift) !== fresh.drift) {
        const err = bad("drift_changed", 409);
        err.fresh = fresh;
        throw err;
      }
      const plan = merch.planReconcileFix({ mode, balance: fresh.balance, ledgerSum: fresh.ledgerSum });
      if (!plan.ok) throw bad(plan.error.toLowerCase());
      let ledgerId = null;
      let balanceAfter = fresh.balance;
      if (mode === "balance_to_ledger") {
        const { data: updated, error } = await supabase.from("users").update({ descoin_balance: plan.balanceAfter }).eq("id", userId).eq("descoin_balance", fresh.balance).select("descoin_balance").maybeSingle();
        if (error) throw error;
        if (!updated) throw bad("drift_changed", 409);
        balanceAfter = updated.descoin_balance;
      } else if (mode === "ledger_to_balance") {
        const { data, error } = await supabase
          .from("descoin_ledger")
          .insert({ user_id: userId, amount: plan.ledgerAmount, reason: "reconcile_adjust", meta: { by: req.user.id, reason, runId: runId || null }, balance_after: fresh.balance })
          .select("id")
          .maybeSingle();
        if (error) {
          if (/check constraint|reason_check/i.test(String(error.message || ""))) throw bad("not_installed", 503);
          throw error;
        }
        ledgerId = data?.id || null;
      }
      try {
        await supabase.from("descoin_reconcile_actions").insert({
          user_id: userId,
          run_id: UUID.test(String(runId || "")) ? runId : null,
          mode,
          drift: plan.drift,
          balance_before: fresh.balance,
          balance_after: balanceAfter,
          ledger_sum_before: fresh.ledgerSum,
          ledger_id: ledgerId,
          reason,
          admin_id: req.user.id,
        });
      } catch {
        /* the audit row below is the durable record */
      }
      return { fresh, plan, balanceAfter, ledgerId };
    });
    audit(req, mode === "note" ? "descoin_reconcile_note" : "descoin_reconcile_fix", userId, {
      mode,
      drift: result.plan.drift,
      balanceBefore: result.fresh.balance,
      balanceAfter: result.balanceAfter,
      ledgerSumBefore: result.fresh.ledgerSum,
      ledgerId: result.ledgerId,
      runId: runId || null,
      reason,
    });
    const io = getIo(req);
    if (io && mode === "balance_to_ledger") {
      io.to(`user:${userId}`).emit("descoin:balance", { balance: result.balanceAfter, delta: result.balanceAfter - result.fresh.balance, reason: "reconcile_fix" });
      if (req.body?.notify) {
        try {
          const { data: u } = await supabase.from("users").select("language").eq("id", userId).maybeSingle();
          const lang = NOTIFY_TEXT[u?.language] ? u.language : "en";
          const [title, body] = NOTIFY_TEXT[lang];
          const popup = require("../lib/adminBroadcastPopup").buildPopupPayload(
            { title, body: body.replace("{n}", new Intl.NumberFormat(lang).format(result.balanceAfter)), severity: "info", emoji: "" },
            { actor: req.user }
          );
          if (popup.ok) io.to(`user:${userId}`).emit("admin:popup", { ...popup.popup, emoji: "" });
        } catch {
          /* the balance event already went out */
        }
      }
    }
    if (io) notifyAdminRoom(io, { type: "descoin_reconcile_fix", userId, mode });
    const after = await reconcileUser(userId);
    res.json({ ok: true, mode, ...after });
  } catch (err) {
    if (err?.fresh) return res.status(409).json({ error: err.code, code: err.code, fresh: err.fresh });
    fail(res, err, "failed_to_fix_the_balance");
  }
});

/** Runs for the Mutabakat tab: latest mismatches with users and any fix made since. */
router.get("/descoin/reconciliation/runs", async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const reconcile = require("../lib/descoinReconcile");
    let runs = [];
    try {
      runs = await reconcile.listRuns(supabase, 14);
    } catch (err) {
      if (store.isMissing(err)) return res.json({ installed: false, latest: null, history: [] });
      throw err;
    }
    const latest = runs[0] || null;
    const mismatches = latest ? latest.mismatches || [] : [];
    const userIds = [...new Set([...mismatches.map((m) => m.user_id), ...runs.map((r) => r.triggered_by)].filter((x) => UUID.test(String(x || ""))))].slice(0, 600);
    const users = userIds.length ? await rows(supabase.from("users").select("id, username, display_name, avatar_url, descoin_frozen, descoin_balance").in("id", userIds)) : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    let actions = [];
    if (latest) {
      try {
        const { data } = await supabase.from("descoin_reconcile_actions").select("id, user_id, mode, drift, reason, admin_id, created_at").gte("created_at", latest.started_at).order("created_at", { ascending: false });
        actions = data || [];
      } catch {
        actions = [];
      }
    }
    const adminIds = [...new Set(actions.map((a) => a.admin_id).filter(Boolean))];
    const admins = adminIds.length ? await rows(supabase.from("users").select("id, username").in("id", adminIds)) : [];
    const adminName = new Map(admins.map((u) => [u.id, u.username]));
    const fixOf = new Map();
    for (const a of actions) if (!fixOf.has(a.user_id)) fixOf.set(a.user_id, { mode: a.mode, at: a.created_at, by: adminName.get(a.admin_id) || null, reason: a.reason });
    const { data: runsTriggered } = await supabase.from("descoin_reconciliation_runs").select("id, triggered_by").in("id", runs.map((r) => r.id).filter(Boolean));
    const trig = new Map((runsTriggered || []).map((r) => [r.id, r.triggered_by]));
    res.json({
      installed: true,
      latest: latest && {
        ...latest,
        mismatches: mismatches.map((m) => {
          const u = byId.get(m.user_id);
          return {
            ...m,
            user: u ? { ...userCard(u), frozen: Boolean(u.descoin_frozen), balanceNow: Number(u.descoin_balance) || 0 } : null,
            fix: fixOf.get(m.user_id) || null,
          };
        }),
      },
      history: runs.map(({ mismatches: _m, ...r }) => ({ ...r, by: byId.get(trig.get(r.id))?.username || null })),
    });
  } catch (err) {
    fail(res, err, "failed_to_load_reconciliation_runs");
  }
});

router.get("/descoin/reconciliation/actions", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const since = req.query.since && Number.isFinite(Date.parse(req.query.since)) ? new Date(req.query.since).toISOString() : new Date(Date.now() - 14 * merch.DAY_MS).toISOString();
    const { data, error } = await supabase.from("descoin_reconcile_actions").select("id, user_id, run_id, mode, drift, balance_before, balance_after, reason, admin_id, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(200);
    if (error) return res.json({ installed: !store.isMissing(error), actions: [] });
    const ids = [...new Set((data || []).map((a) => a.admin_id).filter(Boolean))];
    const admins = ids.length ? await rows(supabase.from("users").select("id, username").in("id", ids)) : [];
    const byId = new Map(admins.map((u) => [u.id, u.username]));
    res.json({ installed: true, actions: (data || []).map((a) => ({ ...a, by: byId.get(a.admin_id) || null })) });
  } catch (err) {
    fail(res, err, "failed_to_load_fixes");
  }
});

router.get("/descoin/reconciliation/settings", async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const { data, error } = await supabase.from("descoin_reconcile_settings").select("interval_hours, hour_of_day, updated_at").eq("id", 1).maybeSingle();
    const settings = !error && data ? data : { interval_hours: 24, hour_of_day: 4 };
    const last = await latestReconcile();
    res.json({ installed: !error, settings, nextAt: new Date(merch.nextReconcileAt(last?.started_at, settings)).toISOString() });
  } catch (err) {
    fail(res, err, "failed_to_load_the_schedule");
  }
});

router.put("/descoin/reconciliation/settings", async (req, res) => {
  try {
    const interval = Number(req.body?.intervalHours);
    const hour = Number(req.body?.hourOfDay ?? 4);
    if (![6, 12, 24].includes(interval) || !Number.isInteger(hour) || hour < 0 || hour > 23) throw bad("bad_schedule");
    const { error } = await supabase.from("descoin_reconcile_settings").upsert({ id: 1, interval_hours: interval, hour_of_day: hour, updated_by: req.user.id, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) throw store.isMissing(error) ? bad("not_installed", 503) : error;
    audit(req, "descoin_reconcile_schedule", null, { intervalHours: interval, hourOfDay: hour });
    const settings = { interval_hours: interval, hour_of_day: hour };
    const last = await latestReconcile();
    res.json({ ok: true, settings, nextAt: new Date(merch.nextReconcileAt(last?.started_at, settings)).toISOString() });
  } catch (err) {
    fail(res, err, "failed_to_save_the_schedule");
  }
});

module.exports = router;
module.exports.__test = { salesStats };
