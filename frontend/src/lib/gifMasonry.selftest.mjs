// node src/lib/gifMasonry.selftest.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { gifRatio, giphyThumb, masonryColumns, masonryColumnCount } from "./gifMasonry.js";

assert.equal(gifRatio({ width: "200", height: "100" }), 0.5);
assert.equal(gifRatio({ width: 200, height: 356 }), 1.78);
assert.equal(gifRatio({ width: 0, height: 5 }), 1);
assert.equal(gifRatio({ width: 10, height: 1000 }), 6);
assert.deepEqual(giphyThumb({ images: { fixed_width_small: { url: "u", width: "100", height: "50" } } }), { url: "u", width: 100, height: 50 });

// Shortest-column packing: no column ends more than one GIF taller than another, order kept.
const sizes = [[200,112],[200,300],[200,200],[200,150],[200,356],[200,120],[200,250],[200,200],[200,90],[200,280],[200,160],[200,220]];
const items = sizes.map(([width, height]) => ({ width, height }));
for (const n of [2, 3, 4]) {
  const cols = masonryColumns(items, n, gifRatio, 0.05);
  assert.equal(cols.flat().length, items.length);
  const h = cols.map((c) => c.reduce((s, x) => s + x.ratio, 0) + 0.05 * Math.max(0, c.length - 1));
  const maxItem = Math.max(...items.map(gifRatio)) + 0.05;
  assert.ok(Math.max(...h) - Math.min(...h) <= maxItem + 1e-9, `cols ${n} balanced`);
  for (const c of cols) for (let i = 1; i < c.length; i += 1) assert.ok(c[i].index > c[i - 1].index);
}
assert.equal(masonryColumns([], 3).length, 3);
assert.equal(masonryColumnCount(360, { target: 150, min: 2, max: 4 }), 2);
assert.equal(masonryColumnCount(640, { target: 150, min: 2, max: 4 }), 4);
assert.equal(masonryColumnCount(0), 2);

// Both grids use it, with one constant gap.
const gp = fs.readFileSync(new URL("../components/chat/GiphyPicker.jsx", import.meta.url), "utf8");
const mp = fs.readFileSync(new URL("../components/profile/ProfileMediaPicker.jsx", import.meta.url), "utf8");
assert.match(gp, /masonryColumns\(/); assert.match(mp, /masonryColumns\(/);
assert.match(fs.readFileSync(new URL("../styles/gif-masonry.css", import.meta.url), "utf8"), /--gif-gap/);
console.log("gifMasonry selftest ok");
