/**
 * Avatar looks: the engine mirror matches the server catalog, specs resolve to mesh groups
 * and palette colours, defaults use free items only, Rastgele stays within allowed items.
 * Run: node frontend/src/world3d/engine/look.selftest.mjs
 */
import assert from "node:assert";
import { createRequire } from "node:module";
import {
  ITEMS, ITEM_IDS, CELLS, STRIPS, COLOR_ROW, HAIR_COLORS, SKINS, LOOKS, BASE_SPEC,
  resolveLook, defaultSpec, looksForRoom, randomSpec, cleanSpec, shade, specItems, itemsInSlot,
} from "./look.js";

const require = createRequire(import.meta.url);
const server = require("../../../backend/lib/world3d/cosmetics.js");

// mirror: same ids, same order, same slots and zones
assert.deepStrictEqual(ITEM_IDS, server.ITEMS.map((i) => i.id), "engine items = server catalog (ids and order)");
for (const it of server.ITEMS) {
  assert.strictEqual(ITEMS[it.id].slot, it.slot, `${it.id} slot`);
  assert.strictEqual(ITEMS[it.id].zone || null, it.zone || null, `${it.id} zone`);
  assert.strictEqual(ITEMS[it.id].swatch.length, 2, `${it.id} swatch gradient`);
}
// the draft's colour row and swatches (drafts.html #s5)
assert.deepStrictEqual(COLOR_ROW, ["#f2f3f8", "#587af6", "#8b6cf6", "#e2556b", "#2aa198", "#d9a21b"]);
assert.deepStrictEqual(itemsInSlot("top").map((id) => ITEMS[id].swatch), [
  ["#e8e8ee", "#b9bcc8"], ["#1e2a5a", "#3a4fd8"], ["#b23a3a", "#e2556b"], ["#d9a21b", "#f2c94c"], ["#2aa198", "#5ad1c4"], ["#3a3d4a", "#6b6f80"],
]);
assert.strictEqual(HAIR_COLORS.length, server.COLOR_COUNT);
assert.strictEqual(SKINS.length, server.SKIN_COUNT);
// palette cells fit in rows 0..6, strips in row 7
for (const idx of Object.values(CELLS)) assert.ok(idx >= 0 && idx < 56, "cell inside rows 0..6");
for (const s of Object.values(STRIPS)) assert.ok(s.y >= 57 && s.y <= 63);

// every preset and default is a valid server look
for (const spec of LOOKS) assert.ok(server.validateLook(cleanSpec(spec)).ok, JSON.stringify(spec));
for (const id of ["a", "b", "demir", "u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8"]) {
  const d = defaultSpec(id);
  assert.ok(server.validateLook(cleanSpec(d)).ok);
  assert.deepStrictEqual(server.unownedPaid(server.validateLook(cleanSpec(d)).look, []), [], "defaults are free");
}
// the six presets of the lineup wear the six outfits
assert.deepStrictEqual(LOOKS.slice(0, 6).map((l) => l.top).sort(), itemsInSlot("top").slice().sort());

// resolve: groups (one merged mesh) and face
let r = resolveLook({ ...BASE_SPEC, hair: "hair_bob", top: "top_vest", face: "face_grin", acc: ["acc_cap", "acc_backpack"] }, "x");
assert.deepStrictEqual(r.groups, ["body", "hair_bob_hat", "top_vest", "acc_cap", "acc_backpack"], "a hat swaps the hair for its under-the-hat variant");
assert.strictEqual(r.face, "face_grin");
assert.strictEqual(r.colors.sleeve, "#eab949", "vest keeps its mustard long-sleeve");
assert.strictEqual(r.colors.torso_stripe, r.colors.top, "plain torso (no stripes)");
r = resolveLook({ ...BASE_SPEC, top: "top_vest", colors: { top: 3 } }, "x");
assert.strictEqual(r.colors.top, COLOR_ROW[3], "colour row sets the main colour");
assert.strictEqual(r.colors.top_dark, shade(COLOR_ROW[3], -0.18), "and its shade");
assert.strictEqual(r.colors.sleeve, "#eab949", "but not the shirt under the vest");
r = resolveLook({ ...BASE_SPEC, top: "top_hoodie", colors: { top: 1 } }, "x");
assert.deepStrictEqual([r.colors.top, r.colors.sleeve, r.colors.torso_stripe], [COLOR_ROW[1], COLOR_ROW[1], COLOR_ROW[1]]);
r = resolveLook({ ...BASE_SPEC, top: "top_hoodie" }, "x");
assert.strictEqual(r.colors.sleeve, r.colors.top, "hoodie sleeves default to the hoodie colour");
r = resolveLook({ ...BASE_SPEC, top: "top_striped" }, "x");
assert.notStrictEqual(r.colors.torso_stripe, r.colors.top, "striped tee has two stripe colours");
r = resolveLook({ ...BASE_SPEC, hair: "hair_curly", colors: { hair: 4 }, skin: 5 }, "x");
assert.strictEqual(r.colors.hair, HAIR_COLORS[4]);
assert.strictEqual(r.colors.brows, shade(HAIR_COLORS[4], -0.18));
assert.strictEqual(r.colors.skin, SKINS[5].skin);
r = resolveLook({ ...BASE_SPEC, acc: ["acc_beanie", "acc_cap", "acc_scarf"], colors: { acc_beanie: 2 } }, "x");
assert.deepStrictEqual(r.groups.slice(2), ["top_hoodie", "acc_beanie", "acc_scarf"], "one item per zone");
assert.strictEqual(r.colors.acc1, COLOR_ROW[2]);
// garbage never breaks the renderer
r = resolveLook({ hair: "nope", top: 5, face: null, acc: "x", skin: 99 }, "someone");
assert.ok(r.groups.length >= 3 && ITEMS[r.face]);
assert.ok(Object.values(r.colors).every((c) => /^#[0-9a-f]{6}$/i.test(c)), "all colours are hex");
for (const cell of Object.keys(CELLS)) if (!["hair_hi"].includes(cell)) assert.ok(resolveLook(LOOKS[3], "x").colors[cell], `cell ${cell} has a colour`);

// room: distinct defaults, overrides by spec or preset index
const room = looksForRoom(["a", "b", "c", "d"], { c: 2, d: { ...BASE_SPEC, top: "top_raincoat" } });
assert.strictEqual(room.get("c").spec.top, LOOKS[2].top);
assert.strictEqual(room.get("d").spec.top, "top_raincoat");
assert.notStrictEqual(room.get("a").index, room.get("b").index, "defaults differ in a room");

// Rastgele: only allowed (free + owned) items, valid for the server
let seed = 7;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const free = new Set(server.ITEMS.filter((i) => i.free).map((i) => i.id));
for (let i = 0; i < 300; i += 1) {
  const s = randomSpec({ ...BASE_SPEC, skin: 4 }, free, rng);
  assert.ok(server.validateLook(s).ok, JSON.stringify(s));
  assert.ok(specItems(s).every((id) => free.has(id)), "random look uses free items only");
  assert.strictEqual(s.skin, 4, "skin stays");
}
const withOwned = new Set([...free, "top_varsity"]);
let sawOwned = false;
for (let i = 0; i < 200; i += 1) if (randomSpec(BASE_SPEC, withOwned, rng).top === "top_varsity") sawOwned = true;
assert.ok(sawOwned, "owned paid items can come up");

console.log("look.selftest: ok");
