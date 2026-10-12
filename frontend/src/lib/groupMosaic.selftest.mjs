// Run: node src/lib/groupMosaic.selftest.mjs
import assert from "node:assert/strict";
import { groupMosaicShape } from "./groupMosaic.js";

const cases = [
  [1, 1, 1],
  [2, 2, 1],
  [3, 3, 1],
  [4, 2, 2],
  [5, 3, 2],
  [6, 3, 2],
  [7, 3, 3],
  [8, 3, 3],
  [9, 3, 3],
  [10, 4, 3],
  [12, 4, 3],
  [13, 4, 4],
];

for (const [n, cols, rows] of cases) {
  const shape = groupMosaicShape(n);
  assert.deepEqual(shape, { cols, rows }, `${n} people`);
  assert.ok(shape.cols <= 4, `${n} stays within 4 columns`);
  assert.ok(shape.cols * shape.rows >= n, `${n} has a cell`);
  assert.ok((shape.rows - 1) * shape.cols < n, `${n} has no empty row`);
}

assert.deepEqual(groupMosaicShape(0), { cols: 1, rows: 1 });
assert.deepEqual(groupMosaicShape(6.9), { cols: 3, rows: 2 });

console.log("groupMosaic.selftest.mjs ok");
