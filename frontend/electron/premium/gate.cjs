'use strict';

/**
 * Descall+ entitlement gate for the Electron main process.
 *
 * Two sources, and a feature is on only when BOTH say so:
 *   1. the renderer's list, pushed over IPC 'premium:entitlements' (setEntitlements);
 *   2. main's own read of GET /api/premium/me with the stored session token (verify()).
 * A tampered renderer (DevTools are open in production) can only narrow the set, never
 * widen it. Until main has verified once, nothing is on.
 *
 * Public API (other agents build on it): setEntitlements(keys, plan), has(key), plan(),
 * onChange(fn). Also: verify(), configure({ fetchMe, log }), snapshot().
 * No electron import: premium.selftest.mjs drives createGate() with a fake fetchMe.
 */

const { normalizePlan, tierAllows, featuresForPlan, PLAN_RANK } = require('./featureTiers.cjs');

const REVERIFY_MS = 30 * 60 * 1000;
const MIN_VERIFY_GAP_MS = 20 * 1000;

/** Server body -> { plan, keys:Set }. Unknown keys and keys above the plan are dropped. */
function parseServer(body) {
  const b = body && typeof body === 'object' ? body : {};
  const status = String(b.status || (b.plan ? 'active' : 'none'));
  const plan = status === 'active' ? normalizePlan(b.plan) : null;
  const list = Array.isArray(b.features) ? b.features.map(String) : featuresForPlan(plan);
  return { plan, keys: new Set(list.filter((k) => tierAllows(plan, k))) };
}

/**
 * Renderer claim ∩ server truth. The plan is the lower of the two plans (null if either
 * is free), and a key must be in both lists and allowed by that plan.
 */
function intersectEntitlements(rendererKeys, rendererPlan, serverKeys, serverPlan) {
  const rp = normalizePlan(rendererPlan);
  const sp = normalizePlan(serverPlan);
  if (!rp || !sp || !rendererKeys || !serverKeys) return { plan: null, keys: new Set() };
  const plan = PLAN_RANK[rp] <= PLAN_RANK[sp] ? rp : sp;
  const server = serverKeys instanceof Set ? serverKeys : new Set(serverKeys);
  const keys = new Set();
  for (const k of rendererKeys) {
    const key = String(k);
    if (server.has(key) && tierAllows(plan, key)) keys.add(key);
  }
  return { plan: keys.size ? plan : plan, keys };
}

function sameSet(a, b) {
  if (a.size !== b.size) return false;
  for (const k of a) if (!b.has(k)) return false;
  return true;
}

function createGate({ fetchMe = null, log = null, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let fetcher = fetchMe;
  let logger = log;
  let renderer = { keys: null, plan: null };
  let server = { keys: null, plan: null, at: 0 };
  let effective = { plan: null, keys: new Set() };
  const listeners = new Set();
  let verifying = null;
  let timer = null;

  function recompute(reason) {
    const next = intersectEntitlements(renderer.keys, renderer.plan, server.keys, server.plan);
    const changed = next.plan !== effective.plan || !sameSet(next.keys, effective.keys);
    effective = next;
    if (!changed) return;
    try { logger?.info?.(`[premium] gate ${reason}: plan=${effective.plan || 'free'} keys=${effective.keys.size}`); } catch (_) { /* ignore */ }
    for (const fn of [...listeners]) {
      try { fn(snapshot()); } catch (err) { try { logger?.warn?.('[premium] gate listener failed:', err?.message || err); } catch (_) { /* ignore */ } }
    }
  }

  function schedule() {
    if (timer) { clearTimer(timer); timer = null; }
    if (!renderer.plan) return;
    timer = setTimer(() => { timer = null; verify({ force: true }); }, REVERIFY_MS);
    if (timer && typeof timer.unref === 'function') timer.unref();
  }

  /** Main's own check. Network failure keeps the last verified answer; 401/404 means free. */
  function verify({ force = false } = {}) {
    if (verifying) return verifying;
    if (!fetcher) {
      server = { keys: new Set(), plan: null, at: now() };
      recompute('no-fetcher');
      return Promise.resolve(snapshot());
    }
    if (!force && server.at && now() - server.at < MIN_VERIFY_GAP_MS) return Promise.resolve(snapshot());
    verifying = (async () => {
      try {
        const body = await fetcher();
        const parsed = parseServer(body);
        server = { keys: parsed.keys, plan: parsed.plan, at: now() };
      } catch (err) {
        const status = Number(err?.status) || 0;
        if (status === 401 || status === 403 || status === 404 || status === 405 || err?.code === 'no-token') {
          server = { keys: new Set(), plan: null, at: now() };
        } else {
          try { logger?.warn?.('[premium] verify failed, keeping last answer:', err?.message || err); } catch (_) { /* ignore */ }
        }
      } finally {
        verifying = null;
      }
      recompute('verify');
      schedule();
      return snapshot();
    })();
    return verifying;
  }

  /** Renderer claim. Always triggers main's own check when the claim changes. */
  function setEntitlements(keys, plan) {
    const list = Array.isArray(keys) ? keys.map(String).slice(0, 256) : [];
    const p = normalizePlan(plan);
    const prev = renderer;
    renderer = { keys: new Set(list), plan: p };
    recompute('renderer');
    const claimChanged = prev.plan !== p || !prev.keys || !sameSet(prev.keys, renderer.keys);
    // A changed claim re-checks at once; a repeated one at most every MIN_VERIFY_GAP_MS
    // (covers a sign-in as another account with the same plan).
    if (p) verify({ force: claimChanged });
    else schedule();
    return snapshot();
  }

  function has(key) {
    return effective.keys.has(String(key));
  }

  function plan() {
    return effective.plan;
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function snapshot() {
    return { plan: effective.plan, keys: [...effective.keys], verifiedAt: server.at || 0 };
  }

  function configure(opts = {}) {
    if ('fetchMe' in opts) fetcher = opts.fetchMe;
    if ('log' in opts) logger = opts.log;
  }

  /** Signed out / token cleared. */
  function reset() {
    renderer = { keys: null, plan: null };
    server = { keys: null, plan: null, at: 0 };
    if (timer) { clearTimer(timer); timer = null; }
    recompute('reset');
  }

  return { setEntitlements, has, plan, onChange, verify, snapshot, configure, reset };
}

const defaultGate = createGate();

module.exports = {
  setEntitlements: defaultGate.setEntitlements,
  has: defaultGate.has,
  plan: defaultGate.plan,
  onChange: defaultGate.onChange,
  verify: defaultGate.verify,
  snapshot: defaultGate.snapshot,
  configure: defaultGate.configure,
  reset: defaultGate.reset,
  createGate,
  intersectEntitlements,
  parseServer,
};
