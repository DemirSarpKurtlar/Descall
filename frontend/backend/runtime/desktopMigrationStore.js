"use strict";

/** The process-wide desktop migration store (config + reports), see lib/desktopMigration.js. */

const { createStore } = require("../lib/desktopMigration");

module.exports = createStore(() => require("../db/supabase"));
