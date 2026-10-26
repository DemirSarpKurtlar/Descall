import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BADGES_TR } from "./badges.tr.js";
import { BADGES_EN } from "./badges.en.js";

const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]));
const tr = Object.fromEntries(flat(BADGES_TR));
const en = Object.fromEntries(flat(BADGES_EN));
assert.deepEqual(Object.keys(tr).sort(), Object.keys(en).sort(), "tr/en badge keys match");
for (const [k, v] of Object.entries({ ...tr, ...en })) assert(v && typeof v === "string", k);
const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
for (const k of Object.keys(tr)) assert.equal(vars(tr[k]), vars(en[k]), `placeholders match for ${k}`);
// Every badge in the art table has a name and a description in both languages.
const art = readFileSync(new URL("../../components/badges/specialBadgeArt.jsx", import.meta.url), "utf8");
const ids = [...art.matchAll(/\{ id: "([a-z0-9]+)"/g)].map((m) => m[1]);
assert.equal(ids.length, 36, "36 badges drawn");
for (const id of ids) for (const loc of [BADGES_TR, BADGES_EN]) assert(loc.names[id] && loc.desc[id], `copy for ${id}`);
// Turkish copy speaks to "sen", never "siz".
assert(!/\b(siz|sizin|sizi|lütfen|ediniz|yapınız|edin)\b/i.test(JSON.stringify(BADGES_TR)), "sen dili");
// The facebook badge is described exactly as approved.
assert.equal(BADGES_TR.desc.facebook, "Bilen bilir. Satılmaz, kodla da çıkmaz; yalnızca elle verilir.");
// Nothing suggests special badges are for sale.
assert(!/satın al(?!ınamaz)|buy now|purchase/i.test(JSON.stringify([BADGES_TR, BADGES_EN])), "never sold");
assert(!/dima|valorant|lfg|recording/i.test(JSON.stringify([BADGES_TR, BADGES_EN])), "no out-of-scope products");
console.log("badges i18n selftest: ok");
