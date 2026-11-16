// Market 2.0 glue: s2- item names from the catalog payload, old-catalog detection.
// Run: node src/lib/shopItemI18n.selftest.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { localizeShopItem, localizedShopItemName, pickLocalized, isRetiredShopItem } from "./shopItemI18n.js";
import { voiceText } from "./shopVoiceText.js";

const require = createRequire(import.meta.url);
const { items } = require("../../backend/catalog/shop2/c4-voice.js");
const LOCALES = ["tr", "en", "de", "es", "fr", "pt-BR", "ru"];

const bell = items.find((i) => i.sku === "s2-join_sound-gece-limani");

// 1. Shop2 API shape: string row + i18n maps.
const apiItem = { id: "1", sku: bell.sku, category: "join_sound", name: "Harbor Bell", description: "x", i18n: { name: bell.name, description: bell.description } };
assert.equal(localizeShopItem(apiItem, "tr").name, "Liman Çanı");
assert.equal(localizeShopItem(apiItem, "ru").name, "Портовый колокол");
assert.equal(localizeShopItem(apiItem, "pt-BR").name, "Sino do porto");
assert.equal(localizeShopItem(apiItem, "pt").name, "Sino do porto", "base language finds the region variant");
assert.equal(localizeShopItem(apiItem, "ja").name, "Harbor Bell", "unknown locale -> English");
assert.match(localizeShopItem(apiItem, "de").description, /Sprachkanal/);

// 2. Catalog-file shape: name / description are the maps themselves.
for (const loc of LOCALES) {
  const out = localizeShopItem(bell, loc);
  assert.equal(out.name, bell.name[loc], `${loc} name`);
  assert.equal(out.description, bell.description[loc], `${loc} description`);
  assert.equal(typeof out.name, "string");
}
assert.equal(localizedShopItemName(bell, "fr"), "Cloche du port");

// 3. name_i18n columns, partial maps, junk.
assert.equal(localizeShopItem({ sku: "s2-x-y", name: "Row", name_i18n: { en: "Only English" } }, "tr").name, "Only English");
assert.equal(localizeShopItem({ sku: "s2-x-y", name: "Row", i18n: { name: { tr: "  " } } }, "tr").name, "Row", "blank text falls back to the row");
assert.equal(localizeShopItem(null, "tr").name, "");
assert.equal(pickLocalized({ "pt-BR": "a", en: "b" }, "pt-PT"), "a");
assert.equal(pickLocalized(null, "tr"), null);

// 4. Old catalog rows still use the shopItems namespace / row text (unchanged path).
const old = { sku: "no-such-old-sku", name: "Old Thing", description: "Old desc", active: true };
assert.deepEqual(localizeShopItem(old, "tr"), { name: "Old Thing", description: "Old desc" });

// 5. "Eski koleksiyon": old, non-country items that left the shop.
assert.equal(isRetiredShopItem({ sku: "bubble-old", category: "chat_bubble", active: false }), true);
assert.equal(isRetiredShopItem({ sku: "bubble-old", category: "chat_bubble", active: true, retired_at: "2026-11-16" }), true);
assert.equal(isRetiredShopItem({ sku: "bubble-old", category: "chat_bubble", active: true }), false, "still on sale before the seed");
assert.equal(isRetiredShopItem({ sku: "flag-tr", category: "countries", active: false }), false, "country flags never old");
assert.equal(isRetiredShopItem({ sku: "s2-voice_tile-prizma", category: "voice_tile", active: false }), false, "an s2 item paused by an admin is not old");
assert.equal(isRetiredShopItem({ sku: "s2-voice_tile-prizma", category: "voice_tile", retired_at: "x" }), true);

// 6. shopVoice text falls back to bundled tables until the namespace is registered.
const echo = (k) => k;
assert.equal(voiceText(echo, "tr", "legacyCollection"), "Eski koleksiyon");
assert.equal(voiceText(echo, "en", "legacyCollection"), "Old collection");
assert.equal(voiceText(echo, "en", "joined", { name: "Deniz" }), "Deniz joined");
assert.equal(voiceText((k) => (k === "shopVoice.play" ? "Hören" : k), "de", "play"), "Hören", "registered namespace wins");
for (const loc of LOCALES) {
  const mod = await import(`../i18n/locales/shopVoice.${loc}.js`);
  const table = Object.values(mod)[0];
  const en = (await import("../i18n/locales/shopVoice.en.js")).SHOP_VOICE_EN;
  assert.deepEqual(Object.keys(table).sort(), Object.keys(en).sort(), `${loc}: same keys as en`);
  for (const [k, v] of Object.entries(table)) {
    assert.ok(typeof v === "string" && v.trim(), `${loc}.${k} filled`);
    const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
    assert.equal(vars(v), vars(en[k]), `${loc}.${k} placeholders`);
  }
}

console.log("shopItemI18n.selftest: ok");
