"use strict";

const express = require("express");
const state = require("../runtime/sharedState");
const { publicFeatureFlags } = require("../lib/systemSettings");
const { edgePublicBase, publicCache } = require("../lib/edgeConfig");

const router = express.Router();

router.get("/", (_req, res) => {
  // 2.11.5: short shared cache (edge 30 s, browser 15 s). Live flips still
  // reach open apps at once through the `features:updated` socket event.
  publicCache(res, { maxAge: 15, sMaxAge: 30 });
  const edgeApiBase = edgePublicBase();
  res.json({
    ...publicFeatureFlags(state.systemConfig?.featureFlags),
    ...(edgeApiBase ? { edgeApiBase } : {}),
  });
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
