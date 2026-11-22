"use strict";

/**
 * Tauri desktop updater feed, mounted at /api/desktop/tauri (public, no auth: the updater
 * sends no session). GET /:target/:arch/:currentVersion, see lib/desktopTauriUpdates.js.
 */

const express = require("express");
const { createFeed, answer } = require("../lib/desktopTauriUpdates");

function createRouter({ feed = createFeed(), env = process.env } = {}) {
  const router = express.Router();
  router.get("/:target/:arch/:currentVersion", async (req, res) => {
    const out = await answer(feed, req.params, env).catch(() => ({ status: 503 }));
    if (out.status === 200) {
      res.set("Cache-Control", "public, max-age=60");
      return res.status(200).json(out.body);
    }
    // 503 makes the client try its next endpoint (GitHub); never cache a failure.
    res.set("Cache-Control", out.status === 204 ? "public, max-age=60" : "no-store");
    return res.status(out.status).end();
  });
  return router;
}

module.exports = createRouter();
module.exports.createRouter = createRouter;
