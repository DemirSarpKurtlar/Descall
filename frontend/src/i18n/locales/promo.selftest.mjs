import assert from "node:assert/strict";
import { PROMO_TR } from "./promo.tr.js";
import { PROMO_EN } from "./promo.en.js";

assert.deepEqual(Object.keys(PROMO_TR).sort(), Object.keys(PROMO_EN).sort(), "tr/en promo keys match");
for (const [k, v] of Object.entries({ ...PROMO_TR, ...PROMO_EN })) assert(v && typeof v === "string", k);
for (const [k, v] of Object.entries(PROMO_TR)) {
  const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  assert.equal(vars(v), vars(PROMO_EN[k]), `placeholders match for ${k}`);
}
// Turkish copy speaks to "sen", never "siz".
assert(!/\b(siz|sizin|sizi|lütfen|ediniz|yapınız)\b/i.test(JSON.stringify(PROMO_TR)), "sen dili");
// Out of scope products never appear.
assert(!/dima|valorant|lfg|kayıt al|recording/i.test(JSON.stringify([PROMO_TR, PROMO_EN])), "no out-of-scope products");
console.log("promo i18n selftest: ok");
