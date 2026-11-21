// Offscreen message rows (hooks/useOffscreenRows.js): one observer per list,
// new rows observed incrementally, marked rows never un-marked on a new message.
import assert from "node:assert/strict";
import { createOffscreenTracker, syncOffscreenTracker, destroyOffscreenTracker } from "./useOffscreenRows.js";

class FakeClassList {
  constructor() { this.set = new Set(); }
  toggle(c, on) { if (on) this.set.add(c); else this.set.delete(c); return on; }
  remove(c) { this.set.delete(c); }
  contains(c) { return this.set.has(c); }
}
const row = (list) => ({ parentNode: list, classList: new FakeClassList() });
const list = { rows: [], querySelectorAll() { return this.rows.filter((r) => r.parentNode === this); } };

let observed = new Set();
let lastCb = null;
let disconnected = 0;
globalThis.IntersectionObserver = class {
  constructor(cb) { lastCb = cb; }
  observe(n) { observed.add(n); }
  unobserve(n) { observed.delete(n); }
  disconnect() { disconnected += 1; observed = new Set(); }
};
let moTarget = null;
globalThis.MutationObserver = class {
  constructor() {}
  observe(t, opts) { moTarget = { t, opts }; }
  disconnect() { moTarget = null; }
};

for (let i = 0; i < 5; i++) list.rows.push(row(list));
const st = createOffscreenTracker(list, null);
syncOffscreenTracker(st);
assert.equal(observed.size, 5);
assert.deepEqual(moTarget.opts, { childList: true }, "only direct children are watched");

// Far rows get marked.
lastCb([{ target: list.rows[0], isIntersecting: false }, { target: list.rows[4], isIntersecting: true }]);
assert.ok(list.rows[0].classList.contains("is-offscreen"));
assert.ok(!list.rows[4].classList.contains("is-offscreen"));

// A new message: one new row observed, the marked row keeps its class, no re-create.
list.rows.push(row(list));
syncOffscreenTracker(st);
assert.equal(observed.size, 6);
assert.equal(disconnected, 0);
assert.ok(list.rows[0].classList.contains("is-offscreen"), "existing marks survive a new message");

// A removed row is unobserved (no leak of detached nodes).
const gone = list.rows.shift();
gone.parentNode = null;
syncOffscreenTracker(st);
assert.equal(observed.size, 5);
assert.ok(!observed.has(gone));

// Teardown clears every mark.
lastCb([{ target: list.rows[1], isIntersecting: false }]);
destroyOffscreenTracker(st);
assert.equal(disconnected, 1);
assert.ok(list.rows.every((r) => !r.classList.contains("is-offscreen")));
assert.equal(moTarget, null);

console.log("useOffscreenRows selftest ok");
