"use strict";

/** Process-wide maintenance service (lib/maintenanceService.js). */
const supabase = require("../db/supabase");
const { createMaintenanceService } = require("../lib/maintenanceService");

let ioRef = null;
const service = createMaintenanceService({ supabase, getIo: () => ioRef });

function attachIo(io) {
  ioRef = io;
}

// Hybrid server: a window changed on another node (no-op on a single node).
require("../lib/cluster").onInvalidate("maintenance", () => {
  service.reloadQuiet().catch(() => {});
});

module.exports = { service, attachIo };
