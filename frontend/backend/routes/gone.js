"use strict";

/**
 * Retired endpoints. Older clients (desktop builds that have not auto-updated yet)
 * may still call these; answer 410 Gone without reading the body so nothing is stored.
 *  - /api/voice-recordings: call recording was removed in 2.9.141 (calls are never recorded).
 *  - /api/dimaai: the in-app assistant was removed in 2.9.141.
 */

const express = require("express");

function goneRouter(message) {
  const router = express.Router();
  router.all("*", (_req, res) => {
    res.set("Connection", "close");
    res.status(410).json({ error: message, code: "GONE" });
  });
  return router;
}

module.exports = { goneRouter };
