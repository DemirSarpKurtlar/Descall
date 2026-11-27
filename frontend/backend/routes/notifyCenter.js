"use strict";

/**
 * Growth 3B notification center (lib/reengage/center.js), signed in:
 *   GET  /api/notify-center                   -> settings, important people, people, servers
 *   PUT  /api/notify-center/settings          -> { ok, settings } | 400 | 503 not_ready
 *   PUT  /api/notify-center/people/:id        -> { ok, person, badge, dmPref }
 *   GET  /api/notify-center/people/:id/next   -> today's pushes about them + the next window
 * The caller's other devices get notify-center:changed so their lists follow.
 */

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const center = require("../lib/reengage/center");

const router = express.Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(res, e, label) {
  const status = e?.status || (e?.code === "NOT_READY" ? 503 : 500);
  if (status >= 500 && e?.code !== "NOT_READY") console.error(`[notify-center] ${label} failed:`, e?.message || e);
  return res.status(status).json({ ok: false, error: e?.code === "NOT_READY" ? "not_ready" : "failed" });
}

function changed(req, payload) {
  try {
    require("../lib/reengage/io").setIo(req.app.get("io"));
    req.app.get("io")?.to(`user:${req.user.id}`).emit("notify-center:changed", payload);
  } catch {
    /* other devices read it on their next open */
  }
}

router.get("/", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    res.json(await center.stateFor(req.user.id));
  } catch (e) {
    fail(res, e, "state");
  }
});

router.put("/settings", requireAuth, async (req, res) => {
  try {
    const out = await center.saveSettings(req.user.id, req.body || {});
    if (!out.ok) return res.status(400).json(out);
    changed(req, { settings: out.settings });
    res.json(out);
  } catch (e) {
    fail(res, e, "settings");
  }
});

router.put("/people/:id", requireAuth, async (req, res) => {
  const peer = String(req.params.id || "");
  if (!UUID.test(peer)) return res.status(400).json({ ok: false, error: "bad_id" });
  try {
    const out = await center.savePerson(req.user.id, peer, req.body || {});
    if (!out.ok) return res.status(out.error === "important_full" ? 409 : 400).json(out);
    changed(req, { peerId: peer, person: out.person, badge: out.badge, dmPref: out.dmPref || null });
    res.json(out);
  } catch (e) {
    fail(res, e, "person");
  }
});

router.get("/people/:id/next", requireAuth, async (req, res) => {
  const peer = String(req.params.id || "");
  if (!UUID.test(peer)) return res.status(400).json({ ok: false, error: "bad_id" });
  res.set("Cache-Control", "no-store");
  try {
    res.json(await center.nextWindow(req.user.id, peer));
  } catch (e) {
    fail(res, e, "next");
  }
});

module.exports = router;
