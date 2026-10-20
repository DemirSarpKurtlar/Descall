// Run: node frontend/src/lib/hoverToolbarPlacement.selftest.mjs
import assert from "node:assert/strict";
import { placeHoverToolbar } from "./hoverToolbarPlacement.js";

const R = (left, top, right, bottom) => ({ left, top, right, bottom });
const clip = R(360, 80, 1016, 549);
const base = { clip, fullW: 335, compactW: 170, barH: 44 };
const hdr = [R(408, 100, 448, 140), R(468, 110, 600, 130)]; // avatar, name+badges

// Wide column: full pill on the card's top-right corner, 12px in, 16px over the top border.
const hdr2 = hdr.map((r) => ({ ...r, top: r.top + 30, bottom: r.bottom + 30 }));
let p = placeHoverToolbar({ ...base, row: R(400, 124, 976, 312), obstacles: hdr2 });
assert.equal(p.where, "edge"); assert.equal(p.compact, false); assert.equal(p.right, 964); assert.equal(p.top, 124 - 16);

// Grouped follow-up bubble far down the card: still the card's top (no bubble input at all).
p = placeHoverToolbar({ ...base, row: R(400, 150, 976, 500), obstacles: hdr.map((r) => ({ ...r, top: r.top + 56, bottom: r.bottom + 56 })) });
assert.equal(p.top, 134);

// First row at the top of the list (no room above) → just inside the card's top-right.
p = placeHoverToolbar({ ...base, row: R(400, 84, 976, 282), obstacles: hdr });
assert.equal(p.where, "inside"); assert.equal(p.top, 90); assert.equal(p.compact, false);

// Narrow column: the long name runs under the full pill → compact on the edge.
const narrow = { ...base, clip: R(360, 80, 760, 549) };
p = placeHoverToolbar({ ...narrow, row: R(400, 200, 720, 380), obstacles: [R(408, 206, 448, 246), R(468, 216, 520, 250)] });
assert.equal(p.where, "edge"); assert.equal(p.compact, true); assert.ok(p.left >= 520 + 4);

// Never clipped: right edge stays inside the column even when the row is wider.
p = placeHoverToolbar({ ...base, row: R(400, 300, 1100, 400), obstacles: [] });
assert.ok(p.right <= 1012);
console.log("hoverToolbarPlacement selftest ok");
