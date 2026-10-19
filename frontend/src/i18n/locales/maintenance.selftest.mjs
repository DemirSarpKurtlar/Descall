import assert from "node:assert/strict";
import { MAINT_TR } from "./maintenance.tr.js";
import { MAINT_EN } from "./maintenance.en.js";
assert.deepEqual(Object.keys(MAINT_TR).sort(), Object.keys(MAINT_EN).sort(), "tr/en maintenance keys match");
for (const [k, v] of Object.entries(MAINT_TR)) assert(v && typeof v === "string", k);
const all = JSON.stringify([MAINT_TR, MAINT_EN]);
assert(!/status\.descall/i.test(all), "no fake status page");
console.log("maintenance i18n selftest: ok");
