'use strict';

/**
 * Main-process entitlement gate (docs/premium/CONTRACT.md, "Client").
 * The renderer sends the entitlement list over IPC (premium:entitlements, main window only).
 * Gated desktop features refuse to start without it. Convenience gate, not security:
 * the server re-checks everything that stores data.
 */

const PLANS = new Set(['plus', 'ultra']);
let current = { plan: null, features: new Set() };
const listeners = new Set();

function setEntitlements(payload) {
  const plan = payload && PLANS.has(payload.plan) ? payload.plan : null;
  const list = plan && Array.isArray(payload.features)
    ? payload.features.filter((k) => typeof k === 'string' && /^[a-z_]{2,40}$/.test(k))
    : [];
  const next = { plan, features: new Set(list) };
  const changed = next.plan !== current.plan
    || next.features.size !== current.features.size
    || [...next.features].some((k) => !current.features.has(k));
  current = next;
  if (changed) {
    for (const fn of listeners) {
      try { fn({ plan: current.plan, features: [...current.features] }); } catch (_) { /* ignore */ }
    }
  }
  return changed;
}

function has(key) {
  return Boolean(current.plan) && current.features.has(String(key || ''));
}

function plan() {
  return current.plan;
}

function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

module.exports = { setEntitlements, has, plan, onChange };
