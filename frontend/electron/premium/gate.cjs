'use strict';

/**
 * Main-process entitlement gate (docs/premium/CONTRACT.md, "Client").
 * The renderer sends the active key list over IPC (`premium:entitlements`);
 * until it does, every gated desktop feature stays off.
 *
 * NOTE: minimal compatible version written by the hotkey/audio/notification
 * agent; the coordinator reconciles it with the shared copy on merge.
 * No electron import, so selftests can load it.
 */

let keys = new Set();
let currentPlan = null;
const listeners = new Set();

function setEntitlements(list, plan) {
  const next = new Set(Array.isArray(list) ? list.filter((k) => typeof k === 'string' && k.length < 64) : []);
  const nextPlan = plan === 'plus' || plan === 'ultra' ? plan : null;
  const same = nextPlan === currentPlan && next.size === keys.size && [...next].every((k) => keys.has(k));
  keys = next;
  currentPlan = nextPlan;
  if (same) return false;
  for (const fn of listeners) {
    try { fn({ keys: [...keys], plan: currentPlan }); } catch (_) { /* keep others running */ }
  }
  return true;
}

function has(key) {
  return Boolean(currentPlan) && keys.has(key);
}

function plan() {
  return currentPlan;
}

function onChange(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

module.exports = { setEntitlements, has, plan, onChange };
