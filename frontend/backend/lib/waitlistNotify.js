"use strict";

const DAY_MS = 24 * 60 * 60 * 1000;
const lastNotified = new Map();

/** One operator email per address per day. Later signups still return ok to the form. */
function claimWaitlistNotify(email, now = Date.now()) {
  const key = String(email || "").trim().toLowerCase();
  if (!key) return false;
  const prev = lastNotified.get(key) || 0;
  if (now - prev < DAY_MS) return false;
  lastNotified.set(key, now);
  return true;
}

function resetWaitlistNotify() {
  lastNotified.clear();
}

module.exports = { claimWaitlistNotify, resetWaitlistNotify, DAY_MS };
