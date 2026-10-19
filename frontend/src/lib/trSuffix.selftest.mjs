// Turkish dative / genitive suffixes for names (O3 ownership transfer, 2.12.2).
// Run: node src/lib/trSuffix.selftest.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { trDative, trGenitive } from "./trSuffix.js";

const require = createRequire(import.meta.url);
const backend = require("../../backend/lib/trSuffix.js");

const dative = {
  Zeynep: "Zeynep'e", Zeki: "Zeki'ye", Ezel: "Ezel'e", Ali: "Ali'ye", Doğa: "Doğa'ya",
  Mert: "Mert'e", Burak: "Burak'a", Ayşe: "Ayşe'ye", Umut: "Umut'a", Gökhan: "Gökhan'a",
  "Sunucu 3": "Sunucu 3'e", "Takım 6": "Takım 6'ya", XYZ: "XYZ'e", "Ilgın": "Ilgın'a", "Kuzey 🎮": "Kuzey 🎮'e",
};
const genitive = {
  "Alpha Topluluğu": "Alpha Topluluğu'nun", "Oyun Gecesi": "Oyun Gecesi'nin", Zeynep: "Zeynep'in",
  "Kampüs Sohbet": "Kampüs Sohbet'in", "Müzik Kulübü": "Müzik Kulübü'nün", Burak: "Burak'ın",
  Doğa: "Doğa'nın", Ordu: "Ordu'nun", Gönül: "Gönül'ün", "Sunucu 3": "Sunucu 3'ün",
  "Takım 9": "Takım 9'un", "Descall": "Descall'ın",
};
for (const [name, want] of Object.entries(dative)) {
  assert.equal(trDative(name), want, `dative ${name}`);
  assert.equal(backend.trDative(name), want, `backend dative ${name}`);
}
for (const [name, want] of Object.entries(genitive)) {
  assert.equal(trGenitive(name), want, `genitive ${name}`);
  assert.equal(backend.trGenitive(name), want, `backend genitive ${name}`);
}
assert.equal(trDative(""), "");
assert.equal(trGenitive("  "), "");
console.log("trSuffix selftest ok");
