// node src/lib/friendFilter.selftest.mjs
import assert from "node:assert/strict";
import { friendMatcher, foldIncludes } from "./friendFilter.js";

const people = [
  { id: 1, username: "ilker", displayName: "İlker" },
  { id: 2, username: "isik", displayName: "IŞIK" },
  { id: 3, username: "kerem_uzun", displayName: "Kerem", customStatus: "Ders çalışıyorum" },
  { id: 4, username: "ayse", display_name: "Ayşe", preview: "Selam, oyun?" },
];
const names = (q) => people.filter(friendMatcher(q)).map((p) => p.id);

assert.deepEqual(names(""), [1, 2, 3, 4], "empty query keeps all");
assert.deepEqual(names("ilker"), [1], "ilker finds İlker");
assert.deepEqual(names("İLKER"), [1], "upper dotted I");
assert.deepEqual(names("ışık"), [2], "ışık finds IŞIK");
assert.deepEqual(names("isik"), [2], "ascii folding");
assert.deepEqual(names("@kerem"), [3], "@handle");
assert.deepEqual(names("calisiyor"), [3], "custom status, folded");
assert.deepEqual(names("ayse"), [4], "display_name, folded");
assert.deepEqual(names("oyun"), [4], "request preview");
assert.deepEqual(names("zzz"), [], "no match");
assert.equal(foldIncludes("Oyun Gecesi", "GEC"), true);
assert.equal(foldIncludes("Şirket", "sir"), true);
assert.equal(foldIncludes("Kampüs", ""), true);
console.log("friendFilter.selftest: ok");
