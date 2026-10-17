// Run: node src/lib/bootSession.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { optimisticSessionReady } from "./bootSession.js";

assert.equal(optimisticSessionReady({ token: "jwt", cachedUser: { id: "u1" } }), true);
assert.equal(optimisticSessionReady({ token: "", cachedUser: { id: "u1" } }), false, "no token → wait / login");
assert.equal(optimisticSessionReady({ token: "jwt", cachedUser: null }), false, "no cached user → wait for /auth/me");
assert.equal(optimisticSessionReady({ token: "jwt", cachedUser: {} }), false);
assert.equal(optimisticSessionReady({}), false);

const app = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
assert.match(app, /useState\(\(\) =>\s*optimisticSessionReady\(/, "App starts sessionChecked from the cached session");
const main = readFileSync(new URL("../main.jsx", import.meta.url), "utf8");
assert.match(main, /prefetchAppChunk\(\)\.catch/, "native/desktop boot prefetches App.jsx in parallel with the Keychain read");
assert.doesNotMatch(main, /const \[\{ default: AppBootSkeleton \}\] = await/, "no second sequential import wave");
console.log("bootSession selftest ok");
