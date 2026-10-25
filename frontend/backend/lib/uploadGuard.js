"use strict";

/**
 * Upload hardening for routes/media.js.
 * - safeExtension: the storage key extension comes from the client's file
 *   name; keep only a short alphanumeric extension (no "/" or other path
 *   characters in the object key).
 * - uploadConcurrencyGate: multer keeps the whole file in memory (up to the
 *   size limit), so one account opening many parallel uploads could exhaust
 *   the instance's RAM. Cap in-flight uploads per user.
 */

function safeExtension(originalName, fallback = "bin") {
  const name = String(originalName || "");
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return fallback;
  const ext = name.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : fallback;
}

function uploadConcurrencyGate({ maxPerUser = 2 } = {}) {
  const inFlight = new Map();
  function gate(req, res, next) {
    const key = String(req.user?.id || req.ip || "anon");
    const current = inFlight.get(key) || 0;
    if (current >= maxPerUser) {
      res.set("Retry-After", "5");
      return res.status(429).json({ error: "Too many uploads at once. Please wait for the current upload to finish." });
    }
    inFlight.set(key, current + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      const n = (inFlight.get(key) || 1) - 1;
      if (n <= 0) inFlight.delete(key);
      else inFlight.set(key, n);
    };
    res.on("finish", release);
    res.on("close", release);
    return next();
  }
  gate._inFlight = inFlight;
  return gate;
}

module.exports = { safeExtension, uploadConcurrencyGate };
