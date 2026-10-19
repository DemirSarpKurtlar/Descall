"use strict";

/** Public maintenance status for every client (signed in or not). */
const express = require("express");
const { service } = require("../runtime/maintenanceInstance");

const router = express.Router();

router.get("/status", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    await service.ensure();
    res.json({ maintenance: service.publicState(), serverTime: new Date().toISOString() });
  } catch {
    res.json({ maintenance: null, serverTime: new Date().toISOString(), degraded: true });
  }
});

module.exports = router;
