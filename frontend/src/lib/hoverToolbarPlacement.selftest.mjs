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

// ...and when the header fills the row width: straddles the bubble's top edge, under the header.
p = placeHoverToolbar({ ...base, bubble: R(468, 340, 537, 380), obstacles: [R(408, 300, 448, 340), R(468, 310, 1000, 330)] });
assert.equal(p.where, "edge"); assert.equal(p.left, 468); assert.ok(p.top >= 336); assert.ok(p.top < 380);

// Bubble near the column's right edge: right-aligned to the bubble, never clipped.
p = placeHoverToolbar({ ...base, bubble: R(930, 420, 1000, 460), obstacles: [] });
assert.equal(p.where, "above-right"); assert.equal(p.right, 1000);

// First row at the very top of the list: not clipped by the column top.
p = placeHoverToolbar({ ...base, bubble: R(468, 100, 537, 140), obstacles: [] });
assert.ok(p.top >= 84); assert.equal(p.left, 468);
console.log("hoverToolbarPlacement selftest ok");
