// Selftest: hiding far-off message rows (content-visibility) never changes
// the layout. Owner report Nov 2026: "on mobile, after Enter the chat
// sometimes scrolls up a little". Measured on the Pixel 7 / iPhone 15
// profiles with 160 messages: each send un-hid ~70 rows (+1800 px) and the
// next observer hid them again at an 88 px placeholder (-1800 px); the
// browser clamped scrollTop and the pin controller read the clamp as the user
// scrolling away, leaving the newest message 60-170 px under the composer.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { applyOffscreen, placeholderHeight } = await import("./useOffscreenRows.js");

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
assert.match(src, /return \(\) => io\.disconnect\(\);/, "a new message only re-observes; hidden rows are not un-hidden");
assert.doesNotMatch(src, /nodes\.forEach\(\(node\) => node\.classList\.remove/, "no un-hide-all on every message");
const list = fs.readFileSync(path.join(here, "../components/chat/MessageList.jsx"), "utf8");
assert.match(list, /useOffscreenRows\(listRef, messages\?\.length \|\| 0\)/, "MessageList uses the hook");
const css = fs.readFileSync(path.join(here, "../styles/messages.css"), "utf8");
assert.match(css, /\.message-group\.is-offscreen\s*\{[^}]*content-visibility:\s*auto/, "hidden rows use content-visibility: auto");

console.log("useOffscreenRows selftest: ok");
