"use strict";

/**
 * Admin "Bakım" tab API. Mounted inside routes/admin.js, after
 * requireAuth + requireAdmin, so every handler here is admin-only on the server.
 */

const express = require("express");
const supabase = require("../db/supabase");
const { service } = require("../runtime/maintenanceInstance");

const router = express.Router();

function send(res, err) {
  const status = err?.status || 500;
  if (status >= 500) console.error("[admin/maintenance]", err?.message || err);
  res.status(status).json({ error: err?.code || "server_error", code: err?.code || "server_error" });
}

async function recentlyActiveUsers() {
  try {
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const { count, error } = await supabase.from("users").select("id", { count: "exact", head: true }).gte("last_seen", since);
    if (error) return null;
    return typeof count === "number" ? count : null;
  } catch {
    return null;
  }
}

router.get("/maintenance/windows", async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(await service.overview({ recentlyActiveUsers: await recentlyActiveUsers() }));
  } catch (err) {
    send(res, err);
  }
});

router.post("/maintenance/windows", async (req, res) => {
  try {
    res.status(201).json({ window: await service.create(req.body || {}, req.user) });
  } catch (err) {
    send(res, err);
  }
});

router.patch("/maintenance/windows/:id", async (req, res) => {
  try {
    res.json({ window: await service.update(String(req.params.id), req.body || {}, req.user) });
  } catch (err) {
    send(res, err);
  }
});

router.post("/maintenance/windows/:id/extend", async (req, res) => {
  try {
    res.json({ window: await service.extend(String(req.params.id), req.body?.minutes, req.user) });
  } catch (err) {
    send(res, err);
  }
});

router.post("/maintenance/windows/:id/end", async (req, res) => {
  try {
    res.json({ window: await service.endNow(String(req.params.id), req.user) });
  } catch (err) {
    send(res, err);
  }
});

router.post("/maintenance/windows/:id/cancel", async (req, res) => {
  try {
    // The typed "İPTAL" confirmation is enforced here too, not only in the modal.
    if (String(req.body?.confirm || "").trim().toLocaleUpperCase("tr-TR") !== "İPTAL")
      return res.status(400).json({ error: "confirm_required", code: "confirm_required" });
    res.json({ window: await service.cancel(String(req.params.id), req.body?.reason, req.user) });
  } catch (err) {
    send(res, err);
  }
});

module.exports = router;
