"use strict";

/** Process-wide maintenance service (lib/maintenanceService.js). */
const supabase = require("../db/supabase");
const { createMaintenanceService } = require("../lib/maintenanceService");

let ioRef = null;
const service = createMaintenanceService({ supabase, getIo: () => ioRef });

function attachIo(io) {
  ioRef = io;
}

module.exports = { service, attachIo };
