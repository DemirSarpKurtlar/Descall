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

const router = express.Router();

/** Public origin of this API, for absolute image URLs (native apps run on a custom scheme). */
function publicApiBase(req) {
  return `${req.protocol}://${req.get("host")}`;
}

router.get("/catalog", requireAuth, async (req, res) => {
  try {
    const rawCategory = typeof req.query.category === "string" ? req.query.category : "";
    const category = shop.IMAGE_ASSET_CATEGORIES.has(rawCategory) ? rawCategory : null;
    const includeAssets = category != null && (req.query.assets === "1" || req.query.assets === "true");
    const items = await shop.listActiveItems({
      category: includeAssets ? category : null,
      includeAssets,
      assetBase: publicApiBase(req),
    });
    res.json({ items });
  } catch (err) {
    console.error("[shop] catalog error:", err.message);
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
    const image = await shop.getCatalogAsset(req.params.id, kind);
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
    const inventory = await shop.getUserInventory(req.user.id);
    res.json({ inventory });
  } catch (err) {
    console.error("[shop] inventory error:", err.message);
    res.status(500).json({ error: "Failed to load your inventory." });
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
    if (!item || !item.active || shop.RETIRED_SHOP_CATEGORIES.has(item.category)) {
      return res.status(404).json({ error: "Item not found." });
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

    let result;
    try {
      result = await purchaseItem(req.user.id, item);
    } catch (err) {
      if (err.message === "INSUFFICIENT_BALANCE") {
        return res.status(402).json({ error: "Not enough DesCoin for this item." });
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

    res.json({ ok: true, balance: result.balance, item });
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
    if (itemId) {
      const owns = await shop.userOwnsItem(req.user.id, itemId);
      if (!owns) return res.status(403).json({ error: "You do not own this item." });
      if (category === "theme") {
        const { themeEquipAllowed } = require("../lib/glassThemeCatalog");
        const item = await shop.getItemById(itemId);
        if (item && !themeEquipAllowed(item.theme_key, req.body?.themeEngine)) {
          return res.status(409).json({
            error: "Update Descall to use this theme.",
            code: "theme_client",
          });
        }
      }
    }
    await shop.equipItem(req.user.id, category, itemId || null);

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
