// Offscreen message rows (hooks/useOffscreenRows.js).
// 1. One observer per list: new rows observed incrementally, marked rows never
//    un-marked on a new message.
// 2. Hiding a row never changes the layout. Owner report Nov 2026: "on mobile,
//    after Enter the chat sometimes scrolls up a little". Each send un-hid ~70
//    rows (+1800 px) and the next observer hid them again at an 88 px
//    placeholder; the browser clamped scrollTop and the pin controller read the
//    clamp as the user scrolling away.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createOffscreenTracker, syncOffscreenTracker, destroyOffscreenTracker, applyOffscreen, placeholderHeight } from "./useOffscreenRows.js";

const here = path.dirname(fileURLToPath(import.meta.url));

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


// A list whose rows take their real height, or, when hidden
// (content-visibility: auto skips them), contain-intrinsic-height for the
// content box plus their padding (desktop / iPad rows: 6 px top and bottom).
const CSS_PLACEHOLDER = 88; // styles/messages.css .message-group.is-offscreen
function makeRow(h, pad = 6) {
  const cls = new Set(["message-group"]);
  return {
    real: h,
    pad,
    style: {},
    classList: { contains: (c) => cls.has(c), toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), remove: (c) => cls.delete(c) },
    get height() {
      if (!cls.has("is-offscreen")) return this.real;
      const m = /([\d.]+)px/.exec(this.style.containIntrinsicHeight || "");
      return (m ? Number(m[1]) : CSS_PLACEHOLDER) + 2 * this.pad;
    },
  };
}
const total = (rows) => rows.reduce((s, r) => s + r.height, 0);
const styleOf = (row) => ({ paddingTop: `${row.pad}px`, paddingBottom: `${row.pad}px`, borderTopWidth: "0px", borderBottomWidth: "0px" });
const hide = (row, isIntersecting = false) => applyOffscreen({ target: row, isIntersecting, boundingClientRect: { height: row.height } }, styleOf);

{
  // Hiding and showing rows of any height leaves the list height unchanged.
  const rows = [140, 64, 212, 88, 97.5, 300].map((h, i) => makeRow(h, i % 2 ? 0 : 6));
  const before = total(rows);
  rows.forEach((r) => hide(r));
  assert.ok(rows.every((r) => r.classList.contains("is-offscreen")), "far rows are hidden");
  assert.equal(total(rows), before, "hiding keeps every row's real height (no clamp, no jump)");
  rows.forEach((r) => hide(r, true));
  assert.ok(rows.every((r) => !r.classList.contains("is-offscreen")), "near rows are shown");
  assert.equal(total(rows), before, "showing again changes nothing either");
}
{
  // An already hidden row reported again keeps its frozen size (its box is
  // the placeholder now, not a new measurement).
  const r = makeRow(150);
  hide(r);
  r.real = 999; // content changed while skipped; not measurable until shown
  applyOffscreen({ target: r, isIntersecting: false, boundingClientRect: { height: 12 } }, styleOf);
  assert.equal(r.style.containIntrinsicHeight, "auto 138px", "content box: 150 - 2 x 6 px padding");
  // No height (detached / not laid out): hide with the stylesheet placeholder.
  const z = makeRow(0);
  applyOffscreen({ target: z, isIntersecting: false, boundingClientRect: { height: 0 } }, styleOf);
  assert.equal(z.style.containIntrinsicHeight, undefined);
  assert.equal(placeholderHeight(100.25, null), 100.25, "no style: border box, not rounded to whole px");
  assert.equal(placeholderHeight(10, { paddingTop: "8px", paddingBottom: "8px" }), 0, "never negative");
  assert.equal(applyOffscreen(null), undefined, "tolerates junk entries");
}

// --- wiring ---
const src = fs.readFileSync(path.join(here, "useOffscreenRows.js"), "utf8");
assert.match(src, /for \(const entry of entries\) applyOffscreen\(entry\);/, "the observer freezes each row's height before hiding it");
const list2 = fs.readFileSync(path.join(here, "../components/chat/MessageList.jsx"), "utf8");
assert.match(list2, /useOffscreenRows\(listRef, messages\?\.length \|\| 0\)/, "MessageList uses the hook");
const css = fs.readFileSync(path.join(here, "../styles/messages.css"), "utf8");
assert.match(css, /\.message-group\.is-offscreen\s*\{[^}]*content-visibility:\s*auto/, "hidden rows use content-visibility: auto");

console.log("useOffscreenRows selftest ok");
