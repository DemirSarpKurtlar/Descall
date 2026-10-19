// Run: node frontend/src/lib/hoverToolbarPlacement.selftest.mjs
import assert from "node:assert/strict";
import { placeHoverToolbar } from "./hoverToolbarPlacement.js";

const R = (left, top, right, bottom) => ({ left, top, right, bottom });
const clip = R(360, 80, 1016, 549);
const base = { clip, fullW: 335, compactW: 170, barH: 44 };
const hdr = [R(408, 100, 448, 140), R(468, 110, 633, 130)]; // avatar, name+badges

// Wide column: full pill at the row's top-right, inset 10px, clear of the header.
let p = placeHoverToolbar({ ...base, row: R(400, 94, 976, 282), bubble: R(468, 151, 537, 191), obstacles: hdr });
assert.equal(p.where, "edge"); assert.equal(p.compact, false); assert.equal(p.right, 966);
assert.ok(p.top >= 130 + 4 || p.left >= 633 + 4);

// Narrow column (members panel open): the name runs under the pill → above the row.
const narrow = { ...base, clip: R(360, 80, 760, 549) };
p = placeHoverToolbar({ ...narrow, row: R(400, 200, 720, 380), bubble: R(468, 257, 537, 297), obstacles: [R(408, 206, 448, 246), R(468, 216, 640, 250)] });
assert.equal(p.where, "above"); assert.equal(p.compact, false); assert.ok(p.bottom <= 200);

// Narrow + first row at the top (no room above, long name) → under the header, inside the row.
p = placeHoverToolbar({ ...narrow, row: R(400, 90, 720, 270), bubble: R(468, 147, 537, 187), obstacles: [R(408, 96, 448, 136), R(468, 106, 640, 140)] });
assert.equal(p.where, "below-header"); assert.ok(p.top >= 144); assert.ok(p.right <= 750);

// Never clipped: right edge stays inside the column even when the row is wider.
p = placeHoverToolbar({ ...base, row: R(400, 300, 1100, 400), bubble: R(468, 300, 600, 340), obstacles: [] });
assert.equal(p.right, 1006);

// Too narrow for the full pill at all → compact, still inside the column.
p = placeHoverToolbar({ ...base, clip: R(360, 80, 640, 549), row: R(370, 300, 640, 400), bubble: R(440, 300, 520, 340), obstacles: [] });
assert.equal(p.compact, true); assert.ok(p.left >= 370);
console.log("hoverToolbarPlacement selftest ok");
