"use strict";

/**
 * POST /api/perf/beacon: real-user performance samples (frontend/src/lib/perf/rum.js).
 *
 * navigator.sendBeacon posts text/plain (a CORS-safe type, so no preflight from the
 * Capacitor / Electron / Tauri origins either); fetch keepalive is the fallback with the
 * same body. Rate limited per IP and per session id; the payload is validated against
 * whitelists (lib/perfModel.validateBatch). The user id comes only from the session token
 * the client puts in the body (verified like the error reporter); the country only from
 * the edge headers. Always answers 204 quickly: a beacon never retries.
 */

const express = require("express");
const model = require("../lib/perfModel");
const store = require("../lib/perfStore");
const { recordFailure } = require("../lib/rateLimit");
const { ipOfRequest } = require("../lib/clientIp");
const { countryOf } = require("../lib/adminTokens/core");

const router = express.Router();
const MAX_BYTES = 32 * 1024;

const textBody = express.text({ type: ["text/plain", "application/json"], limit: MAX_BYTES });

async function userIdFrom(token) {
  const t = String(token || "");
  if (!t || t.length > 4096) return null;
  try {
    const { verifyToken } = require("../config/jwt");
    const { sessionAllowed } = require("../lib/sessionGuard");
    const decoded = verifyToken(t);
    if (!decoded || decoded.pending2fa || !decoded.sub) return null;
    const ok = await sessionAllowed(decoded);
    return ok?.ok && /^[0-9a-f-]{36}$/i.test(String(decoded.sub)) ? String(decoded.sub) : null;
  } catch {
    return null;
  }
}

function parse(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body !== "string" || !req.body) return null;
  try {
    return JSON.parse(req.body);
  } catch {
    return null;
  }
}

router.post("/beacon", textBody, async (req, res) => {
  const ip = ipOfRequest(req);
  // 60 batches per IP per minute (a busy NAT still fits), 20 per page load.
  const byIp = recordFailure(`perf-beacon:${ip}`, { windowMs: 60e3, max: 60 });
  if (!byIp.ok) {
    res.set("Retry-After", String(byIp.retryAfterSec || 60));
    return res.status(429).end();
  }
  const body = parse(req);
  const sid = typeof body?.sid === "string" ? body.sid.slice(0, 40) : "";
  if (sid) {
    const bySession = recordFailure(`perf-beacon-s:${sid}`, { windowMs: 30 * 60e3, max: 20 });
    if (!bySession.ok) return res.status(429).end();
  }
  const out = model.validateBatch(body, { country: countryOf(req.headers) });
  if (!out.ok) return res.status(400).json({ error: out.error, code: out.error });
  const userId = await userIdFrom(body.tk);
  const rows = out.events.map((e) => ({ ...e, user_id: userId }));
  store.enqueue(rows);
  res.status(204).end();
});

// Anything else under /api/perf: no.
router.all("*", (_req, res) => res.status(404).json({ error: "Not found" }));

module.exports = router;
