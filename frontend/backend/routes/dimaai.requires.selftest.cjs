"use strict";

/**
 * Catch missing relative requires before Render boots the server.
 * Run: node frontend/backend/routes/dimaai.requires.selftest.cjs
 */
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const dimaaiPath = path.join(__dirname, "dimaai.js");
const src = fs.readFileSync(dimaaiPath, "utf8");
const specs = [...src.matchAll(/require\("(\.[^"]+)"\)/g)].map((m) => m[1]);
assert.ok(specs.length > 0, "expected relative requires in dimaai.js");

for (const spec of specs) {
  assert.doesNotThrow(
    () => require.resolve(spec, { paths: [__dirname] }),
    `dimaai.js cannot resolve require("${spec}")`
  );
}

assert.ok(
  specs.some((spec) => spec.includes("pythonSandbox")),
  "dimaai.js should load the python sandbox"
);

console.log(`dimaai.requires.selftest.cjs: ok (${specs.length} relative requires)`);
