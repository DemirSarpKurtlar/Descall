// A3: page markers replace body:has(.mkt) etc. so app DOM changes do not
// restyle the whole document. Checks ref counting and that no broad
// html/body-anchored :has() for these surfaces comes back.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { holdDocumentMarker, _documentMarkerCount } from "./documentMarker.js";

function fakeEl() {
  const set = new Set();
  return { classList: { add: (c) => set.add(c), remove: (c) => set.delete(c), has: (c) => set.has(c) }, set };
}
const doc = { body: fakeEl(), documentElement: fakeEl() };

const a = holdDocumentMarker("has-mkt", { doc });
const b = holdDocumentMarker("has-mkt", { doc });
assert.equal(_documentMarkerCount("has-mkt"), 2);
assert.ok(doc.body.set.has("has-mkt"));
a();
a(); // double release is a no-op
assert.ok(doc.body.set.has("has-mkt"), "still held by b");
b();
assert.ok(!doc.body.set.has("has-mkt"));
assert.equal(_documentMarkerCount("has-mkt"), 0);

const h = holdDocumentMarker("has-mkt", { doc, target: "html" });
assert.ok(doc.documentElement.set.has("has-mkt"));
assert.ok(!doc.body.set.has("has-mkt"));
h();
assert.ok(!doc.documentElement.set.has("has-mkt"));
assert.equal(typeof holdDocumentMarker("x", { doc: null }), "function");

// Guard: these anchors made every insertion restyle 6-11k elements.
const src = join(dirname(fileURLToPath(import.meta.url)), "..");
const bad = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".css")) {
      const css = readFileSync(p, "utf8");
      if (/(?:body|html):has\(\s*\.(?:mkt|mkt-hh|dc-consent)\b/.test(css)) bad.push(p);
    }
  }
})(src);
assert.deepEqual(bad, [], `use body.has-mkt / has-dc-consent markers instead of :has(): ${bad.join(", ")}`);
console.log("documentMarker.selftest ok");
