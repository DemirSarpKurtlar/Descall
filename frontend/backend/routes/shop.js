"use strict";

/**
 * Cosmetics + premium-theme shop: catalog, inventory, DesCoin wallet, and
 * equip state. Purchases are paid for entirely with DesCoin — the in-app
 * currency users earn by being active (see lib/descoin.js) — there is no
 * real-money checkout.
 */

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const shop = require("../lib/shop");
const descoin = require("../lib/descoin");
const { purchaseItem } = require("../lib/shopPurchase");
const vouchers = require("../lib/shopVouchers");
const { edgePublicBase, publicCache } = require("../lib/edgeConfig");
const { apiError } = require("../lib/apiError");

const router = express.Router();

/** Public origin of this API, for absolute image URLs (native apps run on a custom scheme). */
function publicApiBase(req) {
  // Behind the Cloudflare edge (EDGE_PUBLIC_BASE) card images load from the
  // CDN host, so repeat views never reach Render.
  return edgePublicBase() || `${req.protocol}://${req.get("host")}`;
}

router.get("/catalog", requireAuth, async (req, res) => {
  try {
    const rawCategory = typeof req.query.category === "string" ? req.query.category : "";
    const category = shop.IMAGE_ASSET_CATEGORIES.has(rawCategory) ? rawCategory : null;
    const includeAssets = category != null && (req.query.assets === "1" || req.query.assets === "true");
    // retiredCategories (2.11.2): installed iOS/Android builds hide these tabs even if
    // their bundled tab list still has them.
    if (includeAssets) {
      const items = await shop.listActiveItems({ category, includeAssets, assetBase: publicApiBase(req) });
      return res.json({ items, retiredCategories: [...shop.RETIRED_SHOP_CATEGORIES] });
    }
    // Full storefront: items at their effective (sale) price, admin-ordered sections, updates.
    res.set("Cache-Control", "no-store");
    const front = await shop.getStorefront({ assetBase: publicApiBase(req) });
    res.json({ ...front, retiredCategories: [...shop.RETIRED_SHOP_CATEGORIES] });
  } catch (err) {
    console.error("[shop] catalog error:", err.message);
    res.status(500).json({ error: "Failed to load shop catalog." });
  }
});

/**
 * Same active catalog as /catalog, without a token: it is identical for every
 * user (inventory, wallet and equip state are separate routes). Shared cache
 * 5 min at the edge, ETag revalidation in the browser (gzipJson).
 */
router.get("/catalog/public", async (req, res) => {
  try {
    const front = await shop.getStorefront({ assetBase: publicApiBase(req) });
    // Short edge cache: sale prices, stock and countdowns change while the shop is open.
    publicCache(res, { maxAge: 20, sMaxAge: 60, swr: 120 });
    res.json({ ...front, retiredCategories: [...shop.RETIRED_SHOP_CATEGORIES] });
  } catch (err) {
    console.error("[shop] public catalog error:", err.message);
    res.status(500).json({ error: "Failed to load shop catalog." });
  }
});

/**
 * Catalog card image (banner / frame / background SVG) — public and
 * cacheable so <img> can load it without a token. URLs carry ?v=<hash>, so a
 * matching version is immutable; anything else gets a short cache.
 */
router.get("/assets/:id", async (req, res) => {
  try {
    const kind = req.query.kind === "preview" ? "preview" : "asset";
    const image = require("../lib/svgStill").stillImage(await shop.getCatalogAsset(req.params.id, kind), req.query.still === "1");
    if (!image) return res.status(404).type("text/plain").send("Not found");
    const versioned = typeof req.query.v === "string" && req.query.v === image.version;
    res.set({
      "Content-Type": image.contentType,
      "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300",
      ETag: `"${image.version}"`,
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "cross-origin",
      // Opened directly, an SVG is a document: no scripts, no outbound loads.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
    });
    if (req.get("if-none-match") === `"${image.version}"`) return res.status(304).end();
    res.send(image.body);
  } catch (err) {
    console.error("[shop] asset error:", err.message);
    res.status(500).type("text/plain").send("Failed to load image");
  }
});

router.get("/inventory", requireAuth, async (req, res) => {
  try {
    const { inventory, retiredTitles } = await shop.getUserInventoryWithRetired(req.user.id);
    res.json({ inventory, retiredTitles });
  } catch (err) {
    console.error("[shop] inventory error:", err.message);
    res.status(500).json({ error: "Failed to load your inventory." });
  }
});

/** Open free-item vouchers, e.g. `{ vouchers: { countries: 1 } }` (2.13.0). */
router.get("/vouchers", requireAuth, async (req, res) => {
  try {
    res.json({ vouchers: await vouchers.getOpenVoucherCounts(req.user.id) });
  } catch (err) {
    console.error("[shop] vouchers error:", err.message);
    res.status(500).json({ error: "Failed to load your vouchers." });
  }
});

router.get("/wallet", requireAuth, async (req, res) => {
  try {
    const balance = await descoin.getBalance(req.user.id);
    res.json({ balance });
  } catch (err) {
    console.error("[shop] wallet error:", err.message);
    res.status(500).json({ error: "Failed to load your DesCoin balance." });
  }
});

router.get("/daily", requireAuth, async (req, res) => {
  try {
    const status = await descoin.getDailyStatus(req.user.id);
    res.json(status);
  } catch (err) {
    console.error("[shop] daily status error:", err.message);
    res.status(500).json({ error: "Failed to load daily DesCoin status." });
  }
});

router.post("/daily/claim", requireAuth, async (req, res) => {
  try {
    const result = await descoin.claimDaily(req.user.id);
    res.json(result);
  } catch (err) {
    console.error("[shop] daily claim error:", err.message);
    res.status(500).json({ error: "Failed to claim daily DesCoin." });
  }
});

router.get("/ledger", requireAuth, async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const entries = await descoin.getLedger(req.user.id, { limit });
    res.json({ entries });
  } catch (err) {
    console.error("[shop] ledger error:", err.message);
    res.status(500).json({ error: "Failed to load your DesCoin history." });
  }
});

// Instant DesCoin purchase — no redirect, no pending state. The debit and
// the inventory grant run under a per-user lock; a lost race is refunded.
router.post("/purchase", requireAuth, async (req, res) => {
  try {
    const { itemId } = req.body || {};
    if (!itemId) return res.status(400).json({ error: "itemId is required." });

    const item = await shop.getItemById(itemId);
    if (!item || !item.active || shop.isRetiredShopItem(item)) {
      return res.status(404).json({ error: "Item not found." });
    }

    // "Tüm ürünler" is browse only (owner, Nov 2026): only items an admin allowed are sold here;
    // the rest come through the Market 2.0 storefront, sets and night market (lib/shopDirectSale.js).
    if (!(await require("../lib/shopDirectSale").freshAllowed(item))) {
      return res.status(403).json(apiError("This item is sold in the storefront and in sets, not directly.", null, { code: "not_direct_sale" }));
    }

    if (item.category === "theme") {
      const { themeEquipAllowed } = require("../lib/glassThemeCatalog");
      if (!themeEquipAllowed(item.theme_key, req.body?.themeEngine)) {
        return res.status(409).json({
          error: "Update Descall to use this theme.",
          code: "theme_client",
        });
      }
    }

    // Sale price, limited stock and time windows (Mağaza remake), decided on fresh rows.
    const merchRules = require("../lib/shopMerch");
    const merchStore = require("../lib/shopMerchStore");
    const [{ merch: merchRow }, campaigns] = await Promise.all([
      merchStore.freshItemMerch(item.id),
      merchStore.liveCampaigns(),
    ]);
    const priced = merchRow ? { ...item, ...merchRow, id: item.id } : item;
    const av = merchRules.availability(priced, campaigns);
    if (av.state === "scheduled" || av.state === "expired") {
      return res.status(410).json(apiError("This item is not on sale right now.", null, { code: "not_available" }));
    }
    if (av.state === "soldout") {
      return res.status(409).json(apiError("This item is sold out.", null, { code: "sold_out" }));
    }
    const pricing = merchRules.effectivePricing(priced, campaigns);
    const expected = Number(req.body?.expectedPrice);
    if (Number.isFinite(expected) && pricing.price > expected) {
      return res.status(409).json(apiError("The price changed. Check the new price and try again.", null, { code: "price_changed", price: pricing.price }));
    }

    if (req.body?.useVoucher === true) {
      try {
        const redeemed = await vouchers.redeemVoucher(req.user.id, item);
        const balance = await descoin.getBalance(req.user.id);
        if (redeemed.alreadyOwned) return res.status(409).json({ error: "You already own this item.", balance });
        return res.json({ ok: true, balance, item, voucher: true });
      } catch (err) {
        if (err.code === "NO_VOUCHER") {
          return res.status(409).json({ error: "You have no free voucher for this item.", code: "no_voucher" });
        }
        throw err;
      }
    }

    let result;
    try {
      result = await purchaseItem(req.user.id, item, {
        price: pricing.price,
        limited: priced.stock_limit != null,
        pricing,
      });
    } catch (err) {
      if (err.message === "INSUFFICIENT_BALANCE") {
        return res.status(402).json({ error: "Not enough DesCoin for this item." });
      }
      if (err.code === "SOLD_OUT") {
        return res.status(409).json(apiError("This item is sold out.", null, { code: "sold_out" }));
      }
      if (err.message === "WALLET_FROZEN" || err.code === "WALLET_FROZEN") {
        return res.status(403).json({ error: "This wallet is frozen.", code: "WALLET_FROZEN" });
      }
      throw err;
    }

    if (result.alreadyOwned) {
      return res.status(409).json({
        error: "You already own this item.",
        balance: result.balance,
      });
    }

    if (result.limited) {
      // Everyone looking at the shop sees the new stock count.
      shop.invalidateCatalogCache();
      req.app.get("io")?.emit("shop:catalog:changed", { itemId: item.id, reason: "stock" });
    }
    res.json({ ok: true, balance: result.balance, item: { ...item, price_descoin: pricing.price }, paid: pricing.price });
  } catch (err) {
    console.error("[shop] purchase error:", err.message);
    res.status(500).json({ error: "Failed to complete purchase." });
  }
});

router.post("/equip", requireAuth, async (req, res) => {
  try {
    const { category, itemId } = req.body || {};
    if (!shop.EQUIP_COLUMN_BY_CATEGORY[category]) {
      return res.status(400).json({ error: "Invalid item category." });
    }
    if (shop.isClosedCategory(category)) {
      return res.status(410).json(apiError("This item is no longer available.", null, { code: "cosmetic_removed" }));
    }
    if (itemId) {
      const owns = await shop.userOwnsItem(req.user.id, itemId);
      if (!owns) return res.status(403).json({ error: "You do not own this item." });
      // The item must belong to the slot it is equipped into (a banner could be put
      // into the badge / theme slot before 2026-10-19).
      const item = await shop.getItemById(itemId);
      if (!item || item.category !== category) {
        return res.status(400).json({ error: "This item does not belong to that category.", code: "category_mismatch" });
      }
      // Frames / badges: only Market 2.0 rows (s2-); older ones stay removed.
      if (shop.isRemovedCosmeticItem(item)) {
        return res.status(410).json(apiError("This item is no longer available.", null, { code: "cosmetic_removed" }));
      }
      if (category === "theme") {
        const { themeEquipAllowed } = require("../lib/glassThemeCatalog");
        if (item && !themeEquipAllowed(item.theme_key, req.body?.themeEngine)) {
          return res.status(409).json({
            error: "Update Descall to use this theme.",
            code: "theme_client",
          });
        }
      }
    }
    // The slot's previous item, for the inventory's equip history ("Kuşanma geçmişi").
    const fromId = await require("../lib/shop2/people").equippedSnapshot(req.user.id).then((l) => l[category] ?? null, () => undefined);
    await shop.equipItem(req.user.id, category, itemId || null);
    if (fromId !== undefined) await require("../lib/shop2/looks").logSingle(req.user.id, category, fromId, itemId || null);

    const io = req.app.get("io");
    if (io) {
      io.to(`user:${req.user.id}`).emit("shop:equipped", { category, itemId: itemId || null });
      // Broadcast full public profile (incl. cosmetics) so friends see frames/badges in chat
      try {
        const { broadcastUserProfileUpdate } = require("../lib/userProfile");
        await broadcastUserProfileUpdate(io, req.user.id);
      } catch (err) {
        console.warn("[shop] profile broadcast after equip failed:", err?.message || err);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[shop] equip error:", err.message);
    res.status(500).json({ error: "Failed to equip item." });
  }
});

module.exports = router;
