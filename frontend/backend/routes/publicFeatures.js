"use strict";

const express = require("express");
const state = require("../runtime/sharedState");
const { publicFeatureFlags } = require("../lib/systemSettings");

const router = express.Router();

router.get("/", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(publicFeatureFlags(state.systemConfig?.featureFlags));
});

module.exports = router;
