"use strict";

/**
 * Per-admin request budget for /api/admin (3.1.3). A stolen or scripted admin
 * session cannot sweep the user base in seconds: changes (POST/PUT/PATCH/DELETE)
 * are capped at 60 a minute, reads at 600 a minute, per account. The live
 * dashboard (overview every 20 s, a few lists) stays far below both.
 */

const { recordFailure } = require("../lib/rateLimit");

const LIMITS = {
  write: { windowMs: 60_000, max: 60 },
  read: { windowMs: 60_000, max: 600 },
};
const MESSAGE = "Too many admin actions. Wait a minute and try again.";

function adminRateLimit(req, res, next) {
  const id = req.user?.id;
  if (!id) return next();
  const write = !["GET", "HEAD", "OPTIONS"].includes(String(req.method).toUpperCase());
  const kind = write ? "write" : "read";
  // Admin Token: each token has its own budget, so a busy bot never locks the owner's panel.
  const key = req.apiToken?.id ? `admin:${kind}:${id}:t:${req.apiToken.id}` : `admin:${kind}:${id}`;
  const verdict = recordFailure(key, LIMITS[kind]);
  if (verdict.ok) return next();
  res.set("Retry-After", String(Math.max(1, verdict.retryAfterSec || 60)));
  return res.status(429).json({ error: MESSAGE, code: "ADMIN_RATE_LIMITED" });
}

module.exports = { adminRateLimit, LIMITS, MESSAGE };
