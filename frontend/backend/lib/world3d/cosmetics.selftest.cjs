"use strict";

/**
 * Character cosmetics catalog, price validation and look validation (pure rules).
 * Run: node frontend/backend/lib/world3d/cosmetics.selftest.cjs
 */

const assert = require("assert");
const C = require("./cosmetics");

// ---------------------------------------------------------------- catalog
const ids = C.ITEMS.map((i) => i.id);
assert.strictEqual(new Set(ids).size, ids.length, "ids are unique");
for (const it of C.ITEMS) {
  assert.ok(C.SLOTS.includes(it.slot), `${it.id}: known slot`);
  assert.ok(it.id.startsWith(`${it.slot}_`), `${it.id}: id starts with its slot`);
  assert.ok(Number.isInteger(it.price) && it.price >= 0 && it.price <= 1000, `${it.id}: sane price`);
  assert.strictEqual(it.free, it.price === 0, `${it.id}: free flag matches the price`);
  assert.ok(Object.isFrozen(it), `${it.id}: frozen`);
  if (it.slot === "acc") assert.ok(["head", "eyes", "neck", "back"].includes(it.zone), `${it.id}: zone`);
}
for (const slot of C.SLOTS) {
  const n = C.ITEMS.filter((i) => i.slot === slot);
  assert.strictEqual(n.length, 6, `${slot}: six items (3 x 2 grid)`);
  assert.ok(n.some((i) => i.free), `${slot}: at least one free item`);
  assert.ok(n.some((i) => !i.free), `${slot}: at least one paid item`);
}
// Kıyafet exactly as approved-ui-5.png
assert.deepStrictEqual(
  C.ITEMS.filter((i) => i.slot === "top").map((i) => [i.id, i.price]),
  [["top_hoodie", 0], ["top_bomber", 150], ["top_varsity", 220], ["top_vest", 120], ["top_raincoat", 180], ["top_striped", 0]],
);
for (const slot of ["hair", "top", "face"]) assert.ok(C.item(C.BASE_LOOK[slot]).free, `base look ${slot} is free`);
assert.deepStrictEqual(C.publicCatalog()[1], { id: "hair_fringe", slot: "hair", price: 90, free: false, zone: null });
assert.strictEqual(C.priceOf("top_varsity"), 220);
assert.strictEqual(C.priceOf("nope"), null);

// ---------------------------------------------------------------- look validation
const good = { v: 1, hair: "hair_bun", top: "top_vest", face: "face_lashes", acc: ["acc_scarf", "acc_cap"], skin: 3, colors: { top: 5, acc_cap: 1, hair: 0 } };
let v = C.validateLook(good);
assert.ok(v.ok, JSON.stringify(v));
assert.deepStrictEqual(v.look.acc, ["acc_cap", "acc_scarf"], "accessories in catalog order");
assert.notStrictEqual(v.look, good, "a fresh object");
assert.ok(C.validateLook({ hair: "hair_swept", top: "top_hoodie", face: "face_classic" }).ok, "defaults fill acc/skin/colors");
const bad = [
  [null, "look_shape"],
  [[], "look_shape"],
  ["x", "look_shape"],
  [{ ...good, v: 2 }, "look_version"],
  [{ ...good, hair: "top_hoodie" }, "bad_hair"],
  [{ ...good, top: "top_tuxedo" }, "bad_top"],
  [{ ...good, face: 7 }, "bad_face"],
  [{ ...good, hair: "HAIR_BUN" }, "bad_hair"],
  [{ ...good, acc: "acc_cap" }, "bad_acc"],
  [{ ...good, acc: ["acc_cap", "acc_cap"] }, "dup_acc"],
  [{ ...good, acc: ["acc_cap", "acc_beanie"] }, "acc_zone"],
  [{ ...good, acc: ["acc_cap", "acc_headphones"] }, "acc_zone"],
  [{ ...good, acc: ["hair_bob"] }, "bad_acc"],
  [{ ...good, acc: ["acc_cap", "acc_glasses", "acc_scarf", "acc_backpack", "acc_beanie"] }, "bad_acc"],
  [{ ...good, skin: 6 }, "bad_skin"],
  [{ ...good, skin: 1.5 }, "bad_skin"],
  [{ ...good, colors: { top: 6 } }, "bad_colors"],
  [{ ...good, colors: { top: "#ff0000" } }, "bad_colors"],
  [{ ...good, colors: { acc_backpack: 1 } }, "bad_colors"],
  [{ ...good, colors: { __proto__x: 1 } }, "bad_colors"],
  [{ ...good, colors: [1] }, "bad_colors"],
];
for (const [look, err] of bad) assert.strictEqual(C.validateLook(look).error, err, `${JSON.stringify(look)} -> ${err}`);
// prototype keys never pass
assert.strictEqual(C.validateLook(JSON.parse('{"hair":"hair_bun","top":"top_vest","face":"face_classic","colors":{"__proto__":1}}')).error, "bad_colors");

// ---------------------------------------------------------------- ownership
v = C.validateLook(good);
assert.deepStrictEqual(C.unownedPaid(v.look, new Set()), [{ id: "top_vest", price: 120 }, { id: "acc_cap", price: 90 }], "free items never need buying");
assert.deepStrictEqual(C.unownedPaid(v.look, ["top_vest"]), [{ id: "acc_cap", price: 90 }]);
assert.deepStrictEqual(C.unownedPaid(v.look, ["top_vest", "acc_cap"]), []);
const worn = C.wearable(v.look, new Set(["acc_cap"]));
assert.strictEqual(worn.top, "top_hoodie", "unowned paid top falls back to the base look");
assert.deepStrictEqual(worn.acc, ["acc_cap", "acc_scarf"]);
const worn2 = C.wearable(v.look, new Set());
assert.deepStrictEqual(worn2.acc, ["acc_scarf"], "unowned accessory dropped");
assert.deepStrictEqual(worn2.colors, { top: 5, hair: 0 }, "its colour goes with it");

// ---------------------------------------------------------------- prices: the server decides
let p = C.priceRequest(["top_bomber", "acc_cap"], 240);
assert.ok(p.ok);
assert.deepStrictEqual(p.items, [{ id: "top_bomber", price: 150 }, { id: "acc_cap", price: 90 }]);
assert.strictEqual(p.total, 240);
p = C.priceRequest(["top_bomber"], 1);
assert.deepStrictEqual([p.ok, p.error, p.total], [false, "price_changed", 150], "a client total that does not match is refused");
p = C.priceRequest([{ id: "top_bomber", price: 1 }]);
assert.strictEqual(p.error, "bad_items", "objects with client prices are refused");
assert.strictEqual(C.priceRequest(["top_bomber", "top_bomber"]).error, "bad_items", "duplicates refused");
assert.strictEqual(C.priceRequest(["top_ghost"]).error, "bad_items");
assert.strictEqual(C.priceRequest([]).error, "bad_items");
assert.strictEqual(C.priceRequest("top_bomber").error, "bad_items");
p = C.priceRequest(["top_hoodie", "top_vest"], 120);
assert.deepStrictEqual(p.items, [{ id: "top_vest", price: 120 }], "free items are never sold");
assert.strictEqual(C.cleanRequestId("abcDEF12-_x"), "abcDEF12-_x");
assert.strictEqual(C.cleanRequestId("short"), "");
assert.strictEqual(C.cleanRequestId("bad id with spaces"), "");
assert.strictEqual(C.cleanRequestId(12345678), "");

console.log("cosmetics.selftest: ok");
