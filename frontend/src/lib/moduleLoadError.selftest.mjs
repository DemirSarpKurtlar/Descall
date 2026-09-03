/**
 * Run: node frontend/src/lib/moduleLoadError.selftest.mjs
 */
import assert from "node:assert/strict";
import { isModuleLoadError } from "./moduleLoadError.js";

assert.equal(isModuleLoadError(new TypeError("Importing a module script failed.")), true);
assert.equal(isModuleLoadError({ message: "Failed to fetch dynamically imported module: https://descall.com/assets/Home-xx.js" }), true);
assert.equal(isModuleLoadError({ name: "ChunkLoadError", message: "Loading chunk 12 failed." }), true);
assert.equal(isModuleLoadError(new TypeError("Cannot read properties of null")), false);
assert.equal(isModuleLoadError(null), false);

console.log("moduleLoadError.selftest.mjs: ok");
