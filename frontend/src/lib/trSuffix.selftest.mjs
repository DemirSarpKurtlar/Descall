// Turkish dative / genitive suffixes for names (O3 ownership transfer, 2.12.2).
// Run: node src/lib/trSuffix.selftest.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { trDative, trGenitive, trAccusative, trLocativeTime } from "./trSuffix.js";

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
// Group member removal (Oct 2026): "Demir, Can'ı gruptan çıkardı", "21:58'de".
const accusative = {
  Can: "Can'ı", Ali: "Ali'yi", Doğa: "Doğa'yı", Gönül: "Gönül'ü", Umut: "Umut'u",
  Zeynep: "Zeynep'i", Ordu: "Ordu'yu", Ayşe: "Ayşe'yi", "Takım 3": "Takım 3'ü", XYZ: "XYZ'i",
};
for (const [name, want] of Object.entries(accusative)) assert.equal(trAccusative(name), want, `accusative ${name}`);
const locative = {
  "21:58": "21:58'de", "21:40": "21:40'ta", "09:30": "09:30'da", "12:03": "12:03'te",
  "10:04": "10:04'te", "18:05": "18:05'te", "20:00": "20:00'de", "10:00": "10:00'da",
  "00:00": "00:00'da", "13:06": "13:06'da", "14:09": "14:09'da", "07:50": "07:50'de",
};
for (const [time, want] of Object.entries(locative)) assert.equal(trLocativeTime(time), want, `locative ${time}`);
assert.equal(trAccusative(""), "");
assert.equal(trDative(""), "");
assert.equal(trGenitive("  "), "");
console.log("trSuffix selftest ok");
