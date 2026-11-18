"use strict";

/**
 * Desktop migration (Electron -> Tauri), client side. Mounted at /api/desktop/migration.
 * Both routes need a signed-in session (the allowlist and the percent bucket are per user).
 *
 *   GET  /plan?installId=&v=&build=&arch=x64&platform=win32
 *        200, body = plan JSON (exact bytes are signed), headers
 *        X-Descall-Plan-Sig (base64 Ed25519 over the body) and X-Descall-Plan-Key (key id).
 *        Without a signing key the body says action "none", reason "unsigned", no header.
 *   POST /report { installId, migrationId, event, step, code, durationMs, strategy,
 *                  perMachine, resumes, steps, winBuild, appVersion, electronVersion }
 *        readiness and outcome events from the Electron bridge, the migrator outcome and
 *        the new app (lib/desktopMigration.js EVENTS).
 *
 * The admin side is routes/adminDesktopMigration.js.
 */

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { apiError } = require("../lib/apiError");
const { recordFailure, rejectIfLimited } = require("../lib/rateLimit");
const dm = require("../lib/desktopMigration");
const store = require("../runtime/desktopMigrationStore");

const router = express.Router();
const PLAN_LIMIT = { windowMs: 15 * 60_000, max: 30 };
const REPORT_LIMIT = { windowMs: 15 * 60_000, max: 120 };

router.get("/plan", requireAuth, async (req, res) => {
  if (rejectIfLimited(res, [recordFailure(`desktop-migration:plan:${req.user.id}`, PLAN_LIMIT)])) return undefined;
  res.set("Cache-Control", "no-store");
  const ctx = { ...dm.parseClientQuery(req.query), userId: req.user.id };
  const key = dm.signingKey();
  let config;
  try {
    ({ config } = await store.getConfig());
  } catch {
    config = dm.DEFAULT_CONFIG;
  }
  const decision = dm.evaluate(config, { ...ctx, signingReady: Boolean(key) });
  const body = JSON.stringify(dm.buildPlan(config, ctx, decision));
  if (key) {
    res.set("X-Descall-Plan-Sig", dm.signBody(body, key));
    res.set("X-Descall-Plan-Key", key.keyId);
  }
  res.type("application/json").send(body);
  return undefined;
});

router.post("/report", requireAuth, express.json({ limit: "16kb" }), async (req, res) => {
  if (rejectIfLimited(res, [recordFailure(`desktop-migration:report:${req.user.id}`, REPORT_LIMIT)])) return undefined;
  const r = dm.cleanReport(req.body, req.user.id);
  if (r.error) return res.status(400).json(apiError("Invalid request body.", undefined, { code: r.error }));
  const stored = await store.addReport(r.row);
  return res.json({ ok: true, stored });
});

module.exports = router;
