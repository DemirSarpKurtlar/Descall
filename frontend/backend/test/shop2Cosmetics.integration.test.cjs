"use strict";

/**
 * Market 2.0: avatar frames and profile badges come back ONLY for the new catalog (sku "s2-").
 * Old frames / badges stay removed exactly as before (never listed, sold, equipped, gifted or
 * returned); titles and backgrounds stay closed for every sku.
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const SVG = "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Ccircle cx='100' cy='100' r='80'/%3E%3C/svg%3E";
const BADGE_SVG = "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3C/svg%3E";
const item = (id, sku, category, extra = {}) => ({
  id, sku, name: sku, description: sku, category, asset_url: SVG, preview_url: null, price_descoin: 300,
  theme_key: null, badge_icon: null, effect_key: null, active: true, rarity: "rare", sort_order: 0, ...extra,
});

const IDS = {
  oldFrame: "00000000-0000-4000-8000-000000000001",
  s2Frame: "00000000-0000-4000-8000-000000000002",
  oldBadge: "00000000-0000-4000-8000-000000000003",
  s2Badge: "00000000-0000-4000-8000-000000000004",
  s2FrameRetired: "00000000-0000-4000-8000-000000000005",
  title: "00000000-0000-4000-8000-000000000006",
};

const fakeSupabase = createFakeSupabase({
  users: [
    { id: "u-alice", username: "alice", active_sessions: [{ id: "s-alice" }], is_admin: true, descoin_balance: 0 },
    // Bob still has an OLD badge id stored from before 2026-10-26.
    { id: "u-bob", username: "bob", active_sessions: [{ id: "s-bob" }], is_admin: false, descoin_balance: 2000, equipped_badge_id: IDS.oldBadge, equipped_avatar_frame_id: IDS.oldFrame },
    { id: "u-cara", username: "cara", active_sessions: [{ id: "s-cara" }], is_admin: false, descoin_balance: 2000 },
  ],
  shop_items: [
    item(IDS.oldFrame, "frame-gold", "avatar_frame"),
    item(IDS.s2Frame, "s2-avatar_frame-laurel-crown", "avatar_frame"),
    item(IDS.oldBadge, "badge-medal", "profile_badge", { asset_url: null, badge_icon: "x" }),
    item(IDS.s2Badge, "s2-profile_badge-spark", "profile_badge", { asset_url: BADGE_SVG }),
    item(IDS.s2FrameRetired, "s2-avatar_frame-cobalt-bevel", "avatar_frame", { active: false }),
    item(IDS.title, "s2-profile_title-x", "profile_title"),
  ],
  user_inventory: [
    { id: "inv-1", user_id: "u-bob", item_id: IDS.oldFrame, acquired_via: "purchase" },
    { id: "inv-2", user_id: "u-bob", item_id: IDS.s2Frame, acquired_via: "purchase" },
    { id: "inv-3", user_id: "u-bob", item_id: IDS.oldBadge, acquired_via: "purchase" },
    { id: "inv-4", user_id: "u-bob", item_id: IDS.s2Badge, acquired_via: "purchase" },
    { id: "inv-5", user_id: "u-bob", item_id: IDS.s2FrameRetired, acquired_via: "purchase" },
    { id: "inv-6", user_id: "u-bob", item_id: IDS.title, acquired_via: "purchase" },
  ],
  descoin_ledger: [],
  shop_purchases: [],
});
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fakeSupabase };

const express = require("express");
const { signToken } = require("../config/jwt");
const shopRouter = require("../routes/shop");
const adminRouter = require("../routes/admin");
const shop = require("../lib/shop");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

const io = { to: () => ({ emit() {} }), emit() {}, sockets: { adapter: { rooms: new Map() } } };

async function req(base, method, urlPath, { body, token } = {}) {
  const res = await fetch(`${base}${urlPath}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { json = { text }; }
  return { status: res.status, body: json, type: res.headers.get("content-type") || "" };
}

async function run() {
  // Pure helpers.
  assert(shop.isRemovedCosmeticItem({ category: "avatar_frame", sku: "frame-gold" }), "old frame is removed");
  assert(!shop.isRemovedCosmeticItem({ category: "avatar_frame", sku: "s2-avatar_frame-x" }), "s2 frame is not removed");
  assert(shop.isRemovedCosmeticItem({ category: "profile_badge", sku: "badge-medal" }), "old badge is removed");
  assert(!shop.isRemovedCosmeticItem({ category: "profile_badge", sku: "s2-profile_badge-x" }), "s2 badge is not removed");
  assert(shop.isRemovedCosmeticItem({ category: "profile_title", sku: "s2-profile_title-x" }), "titles stay removed even with s2-");
  assert(shop.isRemovedCosmeticItem({ category: "profile_background", sku: "s2-profile_background-x" }), "backgrounds stay removed even with s2-");
  assert(shop.isClosedCategory("profile_title") && !shop.isClosedCategory("avatar_frame"), "only titles / backgrounds / sounds are closed categories");

  const app = express();
  app.use(express.json());
  app.set("io", io);
  app.use("/api/shop", shopRouter);
  app.use("/api/admin", adminRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const bob = signToken({ id: "u-bob", username: "bob", sid: "s-bob" });
  const cara = signToken({ id: "u-cara", username: "cara", sid: "s-cara" });
  const alice = signToken({ id: "u-alice", username: "alice", sid: "s-alice" });
  const bobRow = fakeSupabase._tables.users.rows.find((u) => u.id === "u-bob");
  try {
    // Before Bob equips anything new, his stored OLD frame / badge resolve to nothing.
    let eq = (await shop.getEquippedCosmeticsForUsers(["u-bob"])).get("u-bob");
    assert(eq.avatarFrame === null, "stored old frame id is ignored");
    assert(eq.badge === null, "stored old badge id stays hidden");
    let ids = (await shop.getEquippedForUsers(["u-bob"])).get("u-bob");
    assert(ids.avatarFrameId === null && ids.badgeId === null, "old ids are not returned: " + JSON.stringify(ids));

    // Catalog: s2 frame and badge listed with image URLs, old ones never.
    let r = await req(base, "GET", "/api/shop/catalog", { token: cara });
    assert(r.status === 200, "catalog loads");
    const skus = r.body.items.map((i) => i.sku);
    assert(skus.includes("s2-avatar_frame-laurel-crown") && skus.includes("s2-profile_badge-spark"), "s2 frame + badge listed: " + skus);
    assert(!skus.includes("frame-gold") && !skus.includes("badge-medal"), "old frame / badge never listed");
    assert(!skus.includes("s2-profile_title-x"), "titles stay out even with an s2 sku");
    assert(!JSON.stringify(r.body).includes("data:"), "no inline SVG in the catalog");
    const listedBadge = r.body.items.find((i) => i.sku === "s2-profile_badge-spark");
    assert(/\/api\/shop\/assets\//.test(listedBadge.asset_url || ""), "badge carries an asset URL: " + listedBadge.asset_url);
    r = await req(base, "GET", "/api/shop/catalog?category=avatar_frame&assets=1", { token: cara });
    assert(r.status === 200 && r.body.items.length === 1 && r.body.items[0].sku === "s2-avatar_frame-laurel-crown", "frame category lists only s2: " + JSON.stringify(r.body.items));

    // Purchase: old frame refused, s2 frame allowed.
    r = await req(base, "POST", "/api/shop/purchase", { token: cara, body: { itemId: IDS.oldFrame } });
    assert(r.status === 404, "old frame cannot be bought: " + r.status);

    // Equip: old frame 410, s2 frame ok.
    r = await req(base, "POST", "/api/shop/equip", { token: bob, body: { category: "avatar_frame", itemId: IDS.oldFrame } });
    assert(r.status === 410 && r.body.code === "cosmetic_removed", "old frame equip is rejected with 410: " + JSON.stringify(r));
    r = await req(base, "POST", "/api/shop/equip", { token: bob, body: { category: "profile_badge", itemId: IDS.oldBadge } });
    assert(r.status === 410 && r.body.code === "cosmetic_removed", "old badge equip is rejected with 410");
    r = await req(base, "POST", "/api/shop/equip", { token: bob, body: { category: "profile_title", itemId: IDS.title } });
    assert(r.status === 410, "titles stay closed");
    r = await req(base, "POST", "/api/shop/equip", { token: bob, body: { category: "avatar_frame", itemId: IDS.s2Frame } });
    assert(r.status === 200 && r.body.ok, "s2 frame equips: " + JSON.stringify(r.body));
    assert(bobRow.equipped_avatar_frame_id === IDS.s2Frame, "frame id persisted");
    r = await req(base, "POST", "/api/shop/equip", { token: bob, body: { category: "profile_badge", itemId: IDS.s2Badge } });
    assert(r.status === 200, "s2 badge equips");

    // Other users see it (chat / member rows resolve through getEquippedCosmeticsForUsers).
    eq = (await shop.getEquippedCosmeticsForUsers(["u-cara", "u-bob"])).get("u-bob");
    assert(eq.avatarFrame && eq.avatarFrame.sku === "s2-avatar_frame-laurel-crown", "frame resolves for others: " + JSON.stringify(eq.avatarFrame));
    assert(/^\/api\/shop\/assets\/[0-9a-f-]+\?v=[0-9a-f]{12}$/.test(eq.avatarFrame.asset_url), "frame is a lean versioned asset path: " + eq.avatarFrame.asset_url);
    assert(!JSON.stringify(eq.avatarFrame).includes("data:"), "no inline SVG on every chat author");
    assert(eq.badge && eq.badge.sku === "s2-profile_badge-spark", "badge resolves for others");
    ids = (await shop.getEquippedForUsers(["u-bob"])).get("u-bob");
    assert(ids.avatarFrameId === IDS.s2Frame && ids.badgeId === IDS.s2Badge, "ids resolve for s2 items: " + JSON.stringify(ids));

    // The asset route serves it, versioned and immutable.
    const path = eq.avatarFrame.asset_url;
    r = await req(base, "GET", path);
    assert(r.status === 200 && r.type.includes("image/svg+xml"), "frame image served: " + r.status);
    // A Market 2.0 frame that left the storefront still renders on its owner.
    r = await req(base, "GET", `/api/shop/assets/${IDS.s2FrameRetired}`);
    assert(r.status === 200, "inactive s2 frame image still served");
    r = await req(base, "GET", `/api/shop/assets/${IDS.oldFrame}`);
    assert(r.status === 404, "old frame image is not served");

    // Inventory: s2 rows listed, old frame / badge / title rows hidden.
    r = await req(base, "GET", "/api/shop/inventory", { token: bob });
    const invSkus = r.body.inventory.map((row) => row.item?.sku);
    assert(invSkus.includes("s2-avatar_frame-laurel-crown") && invSkus.includes("s2-profile_badge-spark"), "s2 rows in inventory: " + invSkus);
    assert(!invSkus.includes("frame-gold") && !invSkus.includes("badge-medal") && !invSkus.includes("s2-profile_title-x"), "removed rows stay hidden: " + invSkus);

    // Admin gift: old frame refused (410), s2 frame allowed.
    r = await req(base, "POST", "/api/admin/shop/gift", { token: alice, body: { userId: "u-cara", itemId: IDS.oldFrame } });
    assert(r.status === 410 && r.body.code === "cosmetic_removed", "admin cannot gift an old frame: " + r.status);
    r = await req(base, "POST", "/api/admin/shop/gift", { token: alice, body: { userId: "u-cara", itemId: IDS.s2Frame } });
    assert(r.status === 200, "admin can gift an s2 frame: " + r.status + " " + JSON.stringify(r.body));

    // Unequip.
    r = await req(base, "POST", "/api/shop/equip", { token: bob, body: { category: "avatar_frame", itemId: null } });
    assert(r.status === 200 && bobRow.equipped_avatar_frame_id === null, "frame unequips");

    console.log("shop2Cosmetics.integration.test.cjs: ok");
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
