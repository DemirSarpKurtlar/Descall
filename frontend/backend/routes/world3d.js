"use strict";

/**
 * 3D world REST: character cosmetics ("Karakterini oluştur", phase 5).
 *
 *   GET  /api/world3d/cosmetics   catalog (server prices), owned items, saved look, balance
 *   POST /api/world3d/look        { look, purchase?: { items, total, requestId } }
 *
 * Same gate as the /world namespace: admins only until the owner opens the world
 * (canUseWorld). Everyone else gets 403. Purchases are priced on the server
 * (lib/world3d/cosmetics.js) and run in one database transaction
 * (world_cosmetics_purchase); the request id makes a double submit charge once.
 */

const express = require("express");
const { canUseWorld, isAdminRow, createRateLimiter } = require("../lib/world3d/worldCore");

function createWorld3dRouter(deps = {}) {
  const router = express.Router();
  const auth = deps.requireAuth || require("../middleware/auth").requireAuth;
  const loadAdminRow = deps.loadAdminRow || ((id) => require("../lib/adminPermissions").loadRow(id));
  const publicEnabled = deps.publicEnabled || (() => false);
  const service = deps.service || require("../lib/world3d/cosmeticsService");
  const limiters = new Map();

  function limited(userId) {
    let l = limiters.get(userId);
    if (!l) {
      l = createRateLimiter(deps.saveLimit || { ratePerSec: 0.5, burst: 10 });
      limiters.set(userId, l);
      if (limiters.size > 5000) limiters.delete(limiters.keys().next().value);
    }
    return !l.take();
  }

  async function gate(req, res, next) {
    try {
      const row = await Promise.resolve(loadAdminRow(req.user.id)).catch(() => null);
      const verdict = canUseWorld({ isAdmin: isAdminRow(row, req.user), app: "web", publicEnabled: publicEnabled() });
      if (!verdict.ok) return res.status(403).json({ error: "The 3D world is not available for this account.", code: "WORLD_DISABLED" });
      return next();
    } catch {
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  router.use(auth, gate);

  router.get("/cosmetics", async (req, res) => {
    try {
      res.set("Cache-Control", "no-store");
      res.json(await service.state(req.user.id));
    } catch (err) {
      console.error("[world3d] cosmetics state:", err?.message || err);
      res.status(500).json({ error: "Failed to load character items." });
    }
  });

  router.post("/look", async (req, res) => {
    if (limited(String(req.user.id))) return res.status(429).json({ error: "Too many saves. Try again in a moment.", code: "rate_limited" });
    try {
      const out = await service.save(req.user.id, req.body || {});
      if (out.status === 200 && out.body?.purchase && !out.body.purchase.replayed && out.body.purchase.total > 0) {
        // same event the wallet uses everywhere: the app updates the balance at once
        const io = req.app?.get?.("io");
        io?.to?.(`user:${req.user.id}`)?.emit?.("descoin:balance", { balance: out.body.balance, delta: -out.body.purchase.total, reason: "shop_purchase" });
      }
      res.status(out.status).json(out.body);
    } catch (err) {
      console.error("[world3d] save look:", err?.message || err);
      res.status(500).json({ error: "Failed to save your character." });
    }
  });

  return router;
}

module.exports = createWorld3dRouter;
module.exports.createWorld3dRouter = createWorld3dRouter;
