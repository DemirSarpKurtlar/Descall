"use strict";

const express = require("express");
const state = require("../runtime/sharedState");
const { publicFeatureFlags } = require("../lib/systemSettings");

const router = express.Router();

router.get("/", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(publicFeatureFlags(state.systemConfig?.featureFlags));
});

/**
 * Admin-managed extra bad words (system_settings config.profanityWords). The
 * native iOS app merges them with its built-in list to mask message text.
 */
router.get("/profanity", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ words: Array.from(state.profanityWords || []) });
});

module.exports = router;
