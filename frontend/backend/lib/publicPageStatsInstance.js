"use strict";

/** One counter buffer per process (routes/publicPages.js and the vanity join in routes/servers.js). */
const { createPublicPageStats } = require("./publicPageStats");

let instance = null;

function getPublicPageStats() {
  if (!instance) instance = createPublicPageStats({ supabase: require("../db/supabase") });
  return instance;
}

module.exports = { getPublicPageStats };
