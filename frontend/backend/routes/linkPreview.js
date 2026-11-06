"use strict";

/**
 * GET /api/link-preview?url=… (messaging phase 4)
 * → { ok: true, preview: { url, siteName, title, description, image } }
 *   image is a data: URI (or null), so clients never contact the site.
 * → { ok: false, error } when the link has no preview (still 200: the
 *   bubble simply shows no card). 400 for a missing url, 429 when limited.
 * Fetching, SSRF rules, limits and the cache: lib/linkPreview.js.
 */

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { recordFailure, rejectIfLimited } = require("../lib/rateLimit");
const { createLinkPreviewService } = require("../lib/linkPreview");

function createLinkPreviewRouter({ service = createLinkPreviewService() } = {}) {
  const router = express.Router();
  router.get("/", requireAuth, async (req, res) => {
    const url = typeof req.query.url === "string" ? req.query.url : "";
    if (!url) return res.status(400).json({ ok: false, error: "url_required" });
    if (rejectIfLimited(res, [recordFailure(`link-preview:${req.user.id}`, { windowMs: 60000, max: 60 })])) return;
    const out = await service.preview(url);
    res.set("Cache-Control", "private, max-age=3600");
    return res.json(out);
  });
  return router;
}

module.exports = createLinkPreviewRouter();
module.exports.createLinkPreviewRouter = createLinkPreviewRouter;
