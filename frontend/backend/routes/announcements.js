"use strict";

/**
 * Duyurular for members (remake Nov 2026).
 *
 *   GET  /api/announcements               public, cacheable: announcements for everyone only
 *                                         (?lang= picks the language version), old clients keep working
 *   GET  /api/announcements/feed          signed in: filtered for this person on the server (audience,
 *                                         language with English fallback, platform), with seen / read marks
 *   GET  /api/announcements/unread/count  signed in
 *   POST /api/announcements/seen          { ids, platform, lang }  shown on screen
 *   POST /api/announcements/read          { ids }                  window opened / card expanded
 *   POST /api/announcements/:id/read      the old single mark
 *   POST /api/announcements/:id/click     the button was pressed
 *
 * Engagement rows (announcement_reads) are one row per person and
 * announcement, used only for counts in the admin panel.
 */

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const model = require("../lib/announcements/model");
const store = require("../lib/announcements/store");
const service = require("../lib/announcements/service");

const router = express.Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const publicCache = new Map(); // lang -> { at, rows }
// Phrases the app translates through src/i18n/locales/api.tr.js.
const ERR = {
  load: "Failed to load announcements.",
  count: "Failed to count announcements.",
  save: "Could not save.",
};

function cleanIds(raw) {
  return [...new Set((Array.isArray(raw) ? raw : []).map(String).filter((id) => UUID.test(id)))].slice(0, 100);
}

function ctxOf(req) {
  const q = req.query || {};
  const b = req.body || {};
  return { lang: model.normLang(q.lang || b.lang), platform: q.platform || b.platform || null };
}

router.get("/api/announcements", async (req, res) => {
  try {
    const lang = model.normLang(req.query?.lang);
    const key = lang || "-";
    const hit = publicCache.get(key);
    let rows;
    if (hit && Date.now() - hit.at < 30_000) rows = hit.rows;
    else {
      rows = await service.publicList(lang);
      publicCache.set(key, { at: Date.now(), rows });
    }
    require("../lib/edgeConfig").publicCache(res, { maxAge: 30, sMaxAge: 60 });
    res.json({ success: true, announcements: rows });
  } catch (err) {
    console.error("[announcements] public list failed:", err?.message || err);
    res.status(500).json({ success: false, error: ERR.load });
  }
});

router.get("/api/announcements/feed", requireAuth, async (req, res) => {
  try {
    res.set("Cache-Control", "private, no-store");
    const out = await service.feedFor(req.user.id, ctxOf(req));
    res.json({ success: true, ...out });
  } catch (err) {
    console.error("[announcements] feed failed:", err?.message || err);
    res.status(500).json({ success: false, error: ERR.load });
  }
});

router.get("/api/announcements/unread/count", requireAuth, async (req, res) => {
  try {
    res.set("Cache-Control", "private, no-store");
    const out = await service.feedFor(req.user.id, ctxOf(req));
    res.json({ success: true, count: out.unread });
  } catch (err) {
    console.error("[announcements] unread failed:", err?.message || err);
    res.status(500).json({ success: false, error: ERR.count });
  }
});

async function visibleIds(req, ids) {
  const who = await service.whoIs(req.user.id, ctxOf(req));
  const live = await service.liveRows();
  const allowed = new Set(live.filter((r) => model.matchAudience(r.audience, who)).map((r) => String(r.id)));
  return { ids: ids.filter((id) => allowed.has(id)), who };
}

async function mark(req, res, field, ids) {
  try {
    const { ids: ok, who } = await visibleIds(req, ids);
    if (ok.length) await store.markField(req.user.id, ok, field, { platform: who.platform, lang: who.lang });
    res.json({ success: true, marked: ok.length });
  } catch (err) {
    console.error(`[announcements] mark ${field} failed:`, err?.message || err);
    res.status(500).json({ success: false, error: ERR.save });
  }
}

router.post("/api/announcements/seen", requireAuth, (req, res) => mark(req, res, "seen_at", cleanIds(req.body?.ids)));
router.post("/api/announcements/read", requireAuth, (req, res) => mark(req, res, "read_at", cleanIds(req.body?.ids)));
router.post("/api/announcements/:id/read", requireAuth, (req, res) => mark(req, res, "read_at", cleanIds([req.params.id])));
router.post("/api/announcements/:id/click", requireAuth, (req, res) => mark(req, res, "clicked_at", cleanIds([req.params.id])));

module.exports = router;
module.exports.__resetPublicCache = () => publicCache.clear();
