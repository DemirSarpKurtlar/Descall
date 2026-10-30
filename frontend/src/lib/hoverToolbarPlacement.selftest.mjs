// Run: node frontend/src/lib/hoverToolbarPlacement.selftest.mjs
import assert from "node:assert/strict";
import { placeHoverToolbar } from "./hoverToolbarPlacement.js";

const R = (left, top, right, bottom) => ({ left, top, right, bottom });
const clip = R(360, 80, 1016, 549);
const base = { clip, fullW: 102, compactW: 70, barH: 44 };
// Header of a card at top 300: avatar, name+badges+date (bottom 330).
const hdr = [R(408, 300, 448, 340), R(468, 310, 640, 330)];

// Grouped follow-up bubble: directly above it, 6px gap, left-aligned.
let p = placeHoverToolbar({ ...base, bubble: R(468, 420, 537, 460), obstacles: hdr });
assert.equal(p.where, "above"); assert.equal(p.left, 468); assert.equal(p.bottom, 414); assert.equal(p.compact, false);

// First bubble under the header with room (tall gap): above, header untouched.
p = placeHoverToolbar({ ...base, bubble: R(468, 392, 537, 432), obstacles: hdr });
assert.equal(p.where, "above"); assert.equal(p.bottom, 386);

// First bubble right under the header: above it, slid right past the name/badges/date.
p = placeHoverToolbar({ ...base, bubble: R(468, 340, 537, 380), obstacles: hdr });
assert.equal(p.where, "above-beside-header"); assert.equal(p.left, 648); assert.equal(p.bottom, 334);

// ...and when the header fills the row width: beside the bubble on its line (3.1),
// header and text both visible.
p = placeHoverToolbar({ ...base, bubble: R(468, 340, 537, 380), obstacles: [R(408, 300, 448, 340), R(468, 310, 1000, 330)] });
assert.equal(p.where, "beside"); assert.equal(p.left, 545); assert.equal(p.top, 340);

// ...a full-width bubble there: straddles its top edge under the header ("edge").
p = placeHoverToolbar({ ...base, bubble: R(468, 340, 1000, 380), obstacles: [R(408, 300, 448, 340), R(468, 310, 1000, 330)] });
assert.ok(["edge", "corner"].includes(p.where)); assert.ok(p.top >= 332); assert.ok(p.top < 380);

// Bubble near the column's right edge: right-aligned to the bubble, never clipped.
p = placeHoverToolbar({ ...base, bubble: R(930, 420, 1000, 460), obstacles: [] });
assert.equal(p.where, "above-right"); assert.equal(p.right, 1000);

// First row at the very top of the list: not clipped by the column top.
p = placeHoverToolbar({ ...base, bubble: R(468, 100, 537, 140), obstacles: [] });
assert.ok(p.top >= 84); assert.equal(p.where, "beside"); assert.equal(p.left, 545);
// 3.1: the pill never covers another message.
// Grouped follow-up right under the previous bubble: beside it, not over the one above.
const prev = R(468, 370, 700, 414);
p = placeHoverToolbar({ ...base, bubble: R(468, 418, 537, 458), obstacles: hdr, content: [prev] });
assert.equal(p.where, "beside"); assert.equal(p.left, 545); assert.equal(p.top, 418);
// A card (the screenshot case): the pill covers neither the card nor the row above.
const card = R(468, 200, 860, 520);
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
for (const rowAbove of [R(408, 150, 640, 196), R(408, 150, 1000, 196)]) {
  p = placeHoverToolbar({ ...base, bubble: card, obstacles: [], content: [rowAbove] });
  assert.ok(!overlaps(p, card) && !overlaps(p, rowAbove), `covers nothing (${p.where})`);
}
assert.equal(p.where, "beside", "row above spans the column: beside the card");

// Full-width message under another one: on its own top-right corner, under the content above.
p = placeHoverToolbar({ ...base, bubble: R(468, 300, 1000, 420), obstacles: [], content: [R(468, 240, 1000, 296)] });
assert.equal(p.where, "corner"); assert.equal(p.right, 1000); assert.ok(p.top >= 298); assert.ok(p.top < 420);
// Room above and nothing there: unchanged ("above").
p = placeHoverToolbar({ ...base, bubble: R(468, 420, 537, 460), obstacles: hdr, content: [R(468, 300, 700, 340)] });
assert.equal(p.where, "above");

console.log("hoverToolbarPlacement selftest ok");
