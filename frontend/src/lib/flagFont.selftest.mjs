// main.jsx is in the marketing first-paint entry chunk (scripts/perf-budget.mjs, 235 KB).
// 3.0.0: Render production builds failed on that budget (235.1 KB with the real VITE_* env)
// so the backend with GET /admin/signup-stats never deployed. The boot-time flag-font check
// must stay in its own import-free module, not pull countryFlags.js (country tables) in.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installFlagFont, systemDrawsFlags } from "./flagFont.js";
import * as countryFlags from "./countryFlags.js";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const main = read("../main.jsx");
assert.match(main, /import \{ installFlagFont \} from "\.\/lib\/flagFont\.js";/);
assert.doesNotMatch(main, /from "\.\/lib\/countryFlags/, "main.jsx must not import countryFlags (entry chunk)");
assert.doesNotMatch(read("./flagFont.js"), /^\s*import\s/m, "flagFont.js stays import-free");
// Old import path keeps working for the shop / inventory.
assert.equal(countryFlags.installFlagFont, installFlagFont);
assert.equal(countryFlags.systemDrawsFlags, systemDrawsFlags);
// No DOM in Node: both are no-ops that report "system draws flags".
assert.equal(systemDrawsFlags(), true);
assert.equal(installFlagFont(), false);
console.log("flagFont.selftest ok");
