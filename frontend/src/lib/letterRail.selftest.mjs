import assert from "node:assert/strict";
import { condenseLetters, railCapacity } from "./letterRail.js";

const AZ = "ABCÇDEFGHIİJKLMNOÖPRSŞTUÜVYZ".split("");

// Fits: unchanged, no dots.
assert.deepEqual(condenseLetters(["A", "B", "C"], 10).map((r) => r.label), ["A", "B", "C"]);
assert.equal(condenseLetters(AZ, Infinity).length, AZ.length);

// Too tall: never more rows than fit, first + last kept, dots between letters.
for (const cap of [3, 4, 7, 11, 16, 20, 28]) {
  const rows = condenseLetters(AZ, cap);
  assert.ok(rows.length <= Math.max(3, cap), `cap ${cap} -> ${rows.length}`);
  assert.equal(rows[0].letter, "A");
  assert.equal(rows[rows.length - 1].letter, "Z");
  for (let i = 1; i < rows.length; i += 1) assert.ok(!(rows[i].dot && rows[i - 1].dot), "no two dots in a row");
  // Every jump target is a real letter, in order.
  const order = rows.map((r) => AZ.indexOf(r.letter));
  assert.ok(order.every((n) => n >= 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
}

// Capacity: 300px stick area, 16px rows, 12px padding -> 18 rows.
assert.equal(railCapacity({ available: 300 }), 18);
assert.equal(railCapacity({ available: 20 }), 3);
assert.equal(railCapacity({ available: NaN }), Infinity);

console.log("letterRail selftest ok");
