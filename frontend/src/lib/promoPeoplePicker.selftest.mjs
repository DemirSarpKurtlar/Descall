// node src/lib/promoPeoplePicker.selftest.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fold, cleanQuery, visibleHits, splitMatch, moveActive, placePopover } from "./promoPeoplePicker.js";

const require = createRequire(import.meta.url);
const server = require("../../backend/lib/promoUserSearch.js");

// fold is identical to the server's (and so to SQL promo_fold)
for (const s of ["Ayşe Yılmaz", "İLAYDA", "ılgın", "IŞIK", "Çağrı Erdoğan", "Gökhan Güneş", "Şükrü", "Âşık", "mixed_Case.42"]) {
  assert.equal(fold(s), server.fold(s), s);
}
assert.equal(fold("İlayda"), "ilayda");
assert.equal(fold("IRMAK IŞIK"), "irmak isik");
assert.equal(cleanQuery("  @@ayse  "), "ayse");
assert.equal(cleanQuery("ayşe   yıl"), "ayşe yıl");
assert.equal(cleanQuery("x".repeat(80)).length, 32);
assert.equal(cleanQuery("@"), "");

// already picked people are never offered again
const a = { id: "a", username: "ayse" }, b = { id: "b", username: "aysegul" }, c = { id: "c", username: "ayse_k" };
assert.deepEqual(visibleHits([a, b, c, b], [b]).map((x) => x.id), ["a", "c"]);
assert.deepEqual(visibleHits(null, []), []);

// highlight compares folded text
assert.deepEqual(splitMatch("Ayşe Yılmaz", "ayse"), ["", "Ayşe", " Yılmaz"]);
assert.deepEqual(splitMatch("Ayşe Yılmaz", "yil"), ["Ayşe ", "Yıl", "maz"]);
assert.deepEqual(splitMatch("Umut Özdemir", "dem"), ["Umut Öz", "dem", "ir"]);
assert.deepEqual(splitMatch("İlayda Çelik", "@ila"), ["", "İla", "yda Çelik"]);
assert.deepEqual(splitMatch("emre.yildiz", "yil"), ["emre.", "yil", "diz"]);
assert.deepEqual(splitMatch("Demir", "xyz"), ["Demir", "", ""]);
assert.deepEqual(splitMatch("", "a"), ["", "", ""]);

// keyboard
assert.equal(moveActive(-1, 3, "ArrowDown"), 0);
assert.equal(moveActive(2, 3, "ArrowDown"), 0);
assert.equal(moveActive(0, 3, "ArrowUp"), 2);
assert.equal(moveActive(-1, 3, "ArrowUp"), 2);
assert.equal(moveActive(1, 3, "End"), 2);
assert.equal(moveActive(1, 0, "ArrowDown"), -1);

// placement: below by default, above when the iPhone keyboard covers the room below
const field = { top: 700, bottom: 744, left: 20, width: 353 };
const desk = placePopover({ anchor: { top: 300, bottom: 336, left: 400, width: 500 }, viewH: 1000 });
assert.equal(desk.side, "below");
assert.equal(desk.top, 342);
assert.equal(desk.maxH, 320);
const kbUp = placePopover({ anchor: field, viewH: 852, kb: 336 });
assert.equal(kbUp.side, "above", "keyboard up: open above the field, not under the keys");
assert.equal(kbUp.bottom, 852 - 700 + 6);
assert.ok(kbUp.maxH <= 700 - 6 - 8);
const scrolled = placePopover({ anchor: { top: 200, bottom: 244, left: 20, width: 353 }, viewH: 852, kb: 336 });
assert.equal(scrolled.side, "below");
assert.ok(244 + 6 + scrolled.maxH <= 852 - 336, "list ends above the keyboard");

console.log("promoPeoplePicker selftest: ok");
