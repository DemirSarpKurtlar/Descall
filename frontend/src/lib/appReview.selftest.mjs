// node src/lib/appReview.selftest.mjs
import assert from "node:assert/strict";
import { maybeRequestAppReview, noteAppOpen, reviewEligible, REVIEW_RULES } from "./appReview.js";

const DAY = 86400000;
const t0 = Date.UTC(2026, 10, 1, 12);

function memStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
function iosWin(calls) {
  return {
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => "ios",
      Plugins: { DescallDisplay: { requestReview: () => { calls.push(1); return Promise.resolve({ requested: true }); } } },
    },
  };
}

// Pure rules.
const base = { firstOpen: t0, openDays: ["2026-11-01", "2026-11-02", "2026-11-03"], asked: [] };
assert.equal(reviewEligible(base, { now: t0 + 3 * DAY, callMs: 5 * 60000 }), true);
assert.equal(reviewEligible(base, { now: t0 + 1 * DAY, callMs: 5 * 60000 }), false, "too soon after first open");
assert.equal(reviewEligible({ ...base, openDays: ["2026-11-01"] }, { now: t0 + 3 * DAY, callMs: 5 * 60000 }), false, "used on too few days");
assert.equal(reviewEligible(base, { now: t0 + 3 * DAY, callMs: 30000 }), false, "short call");
assert.equal(reviewEligible({ ...base, asked: [t0 + 2 * DAY] }, { now: t0 + 3 * DAY, callMs: 5 * 60000 }), false, "cooldown");
assert.equal(reviewEligible({ ...base, asked: [t0 - 400 * DAY] }, { now: t0 + 3 * DAY, callMs: 5 * 60000 }), true, "an old request does not block");
assert.equal(REVIEW_RULES.maxPerYear, 3);

// Web, Electron and Android never ask.
const store = memStore();
assert.equal(maybeRequestAppReview({ callMs: 600000, win: { Capacitor: { isNativePlatform: () => false } }, storage: store, now: t0 }), false);
assert.equal(maybeRequestAppReview({ callMs: 600000, win: {}, storage: store, now: t0 }), false);

// iOS end to end: three days of use, then a long call asks once, a second call does not.
const calls = [];
const win = iosWin(calls);
const s2 = memStore();
noteAppOpen({ win, storage: s2, now: t0 });
noteAppOpen({ win, storage: s2, now: t0 + DAY });
noteAppOpen({ win, storage: s2, now: t0 + 2 * DAY });
assert.equal(maybeRequestAppReview({ callMs: 10000, win, storage: s2, now: t0 + 2 * DAY, delayMs: 0 }), false);
assert.equal(maybeRequestAppReview({ callMs: 4 * 60000, win, storage: s2, now: t0 + 2 * DAY + 1000, delayMs: 0 }), true);
assert.equal(maybeRequestAppReview({ callMs: 4 * 60000, win, storage: s2, now: t0 + 2 * DAY + 5000, delayMs: 0 }), false, "not twice");
await new Promise((r) => setTimeout(r, 10));
assert.equal(calls.length, 1, "StoreKit asked exactly once");

console.log("appReview selftest ok");
