"use strict";

/**
 * Admin "Promosyon Kodları" API. Mounted inside routes/admin.js after
 * requireAuth + requireAdmin, so every handler here is admin-only on the server.
 * Each write is recorded in promo_audit by the database function itself.
 */

const express = require("express");
const supabase = require("../db/supabase");
const promo = require("../lib/promo");

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

router.get("/promo-codes/shop-items", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("shop_items")
      .select("id, name, category, price_descoin")
      .eq("active", true)
      .order("name", { ascending: true })
      .limit(500);
    if (error) throw Object.assign(new Error("shop_items"), { status: 500 });
    res.json({ items: data || [] });
  } catch (err) {
    send(res, err);
  }
});

router.get("/promo-codes/users", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().replace(/[%_,()]/g, "").slice(0, 32);
    if (q.length < 2) return res.json({ users: [] });
    const { data, error } = await supabase
      .from("users")
      .select("id, username, display_name, avatar_url")
      .ilike("username", `${q}%`)
      .limit(8);
    if (error) throw Object.assign(new Error("users"), { status: 500 });
    res.json({ users: data || [] });
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
