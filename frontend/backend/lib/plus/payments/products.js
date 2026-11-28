"use strict";

/**
 * Product keys <-> store / provider product ids (config.products.<provider>, admin-editable,
 * non-secret). A key is "<plan>_<period>" for subscriptions or "gift_<plan>_<months>" for gifts.
 */

const KEY_RE = /^(?:(plus|ultra)_(monthly|yearly)|gift_(plus|ultra)_(1|3|12))$/;

function parseKey(key) {
  const m = KEY_RE.exec(String(key || ""));
  if (!m) return null;
  if (m[1]) return { key: m[0], kind: "subscription", plan: m[1], period: m[2], months: m[2] === "yearly" ? 12 : 1, days: m[2] === "yearly" ? 365 : 30 };
  return { key: m[0], kind: "gift", plan: m[3], period: null, months: Number(m[4]), days: Number(m[4]) * 30 };
}

/** Store / provider id for a key, or null when not configured. */
function idFor(cfg, provider, key) {
  const id = cfg?.products?.[provider]?.[key];
  return typeof id === "string" && id ? id : null;
}

/** Key for a store / provider id, or null. */
function keyFor(cfg, provider, productId) {
  const map = cfg?.products?.[provider] || {};
  for (const [k, v] of Object.entries(map)) if (v && v === productId) return parseKey(k);
  return null;
}

module.exports = { KEY_RE, parseKey, idFor, keyFor };
