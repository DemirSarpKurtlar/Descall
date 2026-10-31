// i18n core (3.7.21): registry lookups, message formatting (plural / select),
// pseudo locale, translate() fallback and Intl formatting helpers.
import assert from "node:assert/strict";

// Minimal browser globals so registry / storage modules can load.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const reg = await import("./registry.js");
const { formatMessage, messageArguments, isWellFormedMessage } = await import("./message.js");
const { pseudoize } = await import("./pseudo.js");
const fmt = await import("./format.js");

// --- registry
assert.equal(reg.normalizeLocale("tr-TR"), "tr");
assert.equal(reg.normalizeLocale("EN_us"), "en");
assert.equal(reg.normalizeLocale("de"), "de", "German is live");
assert.equal(reg.normalizeLocale("ja"), null, "unregistered language");
assert.equal(reg.normalizeLocale("qps"), null, "pseudo hidden without preview");
assert.equal(reg.normalizeLocale("de", { preview: true }), "de");
assert.equal(reg.normalizeLocale("pt-PT", { preview: true }), "pt-BR");
assert.equal(reg.normalizeLocale("qps", { preview: true }), "qps");
assert.equal(reg.intlTag("tr"), "tr-TR");
assert.equal(reg.intlTag("nope"), reg.intlTag("en"));
assert.equal(reg.htmlLang("qps"), "en");
assert.equal(reg.textDirection("en"), "ltr");
assert.deepEqual(reg.selectableLocales({ preview: false }).map((l) => l.id), reg.liveLocales().map((l) => l.id));
assert.ok(!reg.selectableLocales({ preview: false }).some((l) => l.id === "qps"), "pseudo only in preview");
assert.ok(reg.selectableLocales({ preview: true }).some((l) => l.id === "ru"));
store.set("descall_i18n_preview", "1");
assert.equal(reg.isPreviewEnabled(), true);
assert.equal(reg.normalizeLocale("ru"), "ru");
store.delete("descall_i18n_preview");

// --- messages
assert.equal(formatMessage("Hi {name}", { name: "Ada" }), "Hi Ada");
assert.equal(formatMessage("Hi {{name}}", { name: "Ada" }), "Hi Ada");
assert.equal(formatMessage("{count}m ago", { count: 5 }), "5m ago");
assert.equal(formatMessage("no vars #general"), "no vars #general");
assert.equal(formatMessage("odd { brace"), "odd { brace");
const files = "{n, plural, =0 {no files} one {# file} other {# files}}";
assert.equal(formatMessage(files, { n: 0 }, "en"), "no files");
assert.equal(formatMessage(files, { n: 1 }, "en"), "1 file");
assert.equal(formatMessage(files, { n: 1234 }, "en-GB"), "1,234 files");
assert.equal(formatMessage(files, { n: 1234 }, "de-DE"), "1.234 files");
const ru = "{n, plural, one {# сообщение} few {# сообщения} many {# сообщений} other {# сообщения}}";
assert.equal(formatMessage(ru, { n: 1 }, "ru-RU"), "1 сообщение");
assert.equal(formatMessage(ru, { n: 3 }, "ru-RU"), "3 сообщения");
assert.equal(formatMessage(ru, { n: 5 }, "ru-RU"), "5 сообщений");
assert.equal(formatMessage(ru, { n: 21 }, "ru-RU"), "21 сообщение");
assert.equal(
  formatMessage("{kind, select, voice {Voice call with {name}} other {Call with {name}}}", { kind: "voice", name: "Ada" }),
  "Voice call with Ada"
);
assert.deepEqual([...messageArguments(files)].sort(), ["n"]);
assert.deepEqual([...messageArguments("{a} {{b}} {k, select, x {{c}} other {d}}")].sort(), ["a", "b", "c", "k"]);
assert.ok(isWellFormedMessage(files));
assert.ok(!isWellFormedMessage("{n, plural, one {# file}}"), "plural needs other");
assert.ok(!isWellFormedMessage("broken {"));
assert.ok(isWellFormedMessage("{n, plural, one {# a} other {# b}} · max {score}"), "plural followed by another placeholder");
assert.ok(!isWellFormedMessage("{n, plurl, one {x} other {y}}"), "typo in the keyword");

// --- pseudo
const p = pseudoize("Delete {count} messages");
assert.ok(p.startsWith("[[") && p.endsWith("]]"));
assert.ok(p.includes("{count}"), "placeholders survive");
assert.ok(!/Delete/.test(p), "letters are accented");
assert.equal(formatMessage(pseudoize(files), { n: 2 }).includes("2"), true, "plural survives pseudo");

// --- translate (catalogs from disk)
const i18n = await import("./index.js");
await i18n.loadI18nCatalogs("en");
assert.equal(i18n.translate("en", "settings.language"), "Language");
assert.equal(i18n.translate("tr", "settings.language"), "Dil");
assert.equal(i18n.translate("tr", "Failed to load servers"), "Sunucular yüklenemedi");
assert.equal(i18n.translate("en", "Some unknown English text"), "Some unknown English text");
await i18n.ensureLocaleLoaded("de");
assert.notEqual(i18n.translate("de", "settings.language"), "Language", "German catalog is used");
assert.equal(i18n.translate("de", "Some key nobody translated"), "Some key nobody translated", "missing key falls back to the key / English");
await i18n.ensureLocaleLoaded("qps");
assert.ok(i18n.translate("qps", "settings.language").startsWith("[["), "pseudo wraps catalog text");
assert.equal(i18n.translate("en", "{n, plural, one {# file} other {# files}}", { n: 2 }), "2 files", "ICU formatter loaded with the catalogs");
assert.equal(i18n.translate("tr", "{groupName} | Group Call", { groupName: "Ekip" }), "Ekip | Grup araması");

// --- Intl helpers follow locales.json
assert.equal(fmt.formatNumber(1234.5, "tr"), "1.234,5");
assert.equal(fmt.formatNumber(1234.5, "en"), "1,234.5");
assert.equal(fmt.formatRelativeTime(Date.now() - 5 * 60 * 1000, "en"), "5 minutes ago");
assert.equal(fmt.formatRelativeTime(Date.now() - 5 * 60 * 1000, "tr"), "5 dakika önce");
assert.equal(fmt.formatList(["A", "B", "C"], "en"), "A, B and C");
assert.equal(fmt.displayName("DE", "tr"), "Almanya");
assert.equal(fmt.upper("istanbul", "tr"), "İSTANBUL");
assert.equal(fmt.upper("istanbul", "en"), "ISTANBUL");

console.log("i18nCore.selftest: ok");
