// Server-side UI language resolution (lib/locales.js, shared src/i18n/locales.json).
const assert = require("node:assert/strict");
const L = require("./locales");
const { langFrom } = require("./emailTemplates");
const { pickLang } = require("./iosAlertPush");

const json = require("../../src/i18n/locales.json");
assert.equal(L.FALLBACK, json.fallback);
assert.ok(L.LOCALES.some((l) => l.id === "en" && l.status === "live"), "English is live");
assert.ok(L.LOCALES.some((l) => l.id === "tr" && l.status === "live"), "Turkish is live");
assert.equal(new Set(L.LOCALES.map((l) => l.id)).size, L.LOCALES.length, "locale ids are unique");

// normalizeLocale
assert.equal(L.normalizeLocale("TR"), "tr");
assert.equal(L.normalizeLocale("tr-TR"), "tr");
assert.equal(L.normalizeLocale("en_US"), "en");
assert.equal(L.normalizeLocale("pt_BR"), "pt-BR");
assert.equal(L.normalizeLocale("pt-PT"), "pt-BR", "same base language");
assert.equal(L.normalizeLocale("de-AT"), "de");
assert.equal(L.normalizeLocale("xx"), null);
assert.equal(L.normalizeLocale(""), null);
assert.equal(L.normalizeLocale("qps"), null, "pseudo locale is client-only");
for (const l of L.LOCALES.filter((x) => x.status !== "live")) {
  assert.equal(L.normalizeLocale(l.id, { liveOnly: true }), null, `${l.id} is not live yet`);
}

// Accept-Language
assert.deepEqual(L.parseAcceptLanguage("tr-TR,tr;q=0.9,en;q=0.8"), ["tr-TR", "tr", "en"]);
assert.deepEqual(L.parseAcceptLanguage("en;q=0.5, de"), ["de", "en"]);
assert.deepEqual(L.parseAcceptLanguage("*;q=0.1, fr;q=0"), []);

// resolveLang: first live locale with a template, else the fallback
assert.equal(L.resolveLang(["de", "en"], { available: ["tr", "en"], fallback: "tr" }), "en");
assert.equal(L.resolveLang(["de"], { available: ["tr", "en"], fallback: "tr" }), "tr");
assert.equal(L.resolveLang([null, ["fr-FR", "tr"]], { available: ["tr", "en"], fallback: "en" }), "tr");

// Email and push keep their Turkish default and the account-language priority
assert.equal(langFrom("de-DE,de;q=0.9,en;q=0.8"), "de", "a German browser gets German");
assert.equal(langFrom("ja-JP,en;q=0.8"), "en", "unsupported first language, English second");
assert.equal(langFrom("ja-JP"), "tr", "nothing usable -> Turkish default");
assert.equal(langFrom("en-US", "tr"), "tr");
assert.equal(pickLang("en", "tr"), "en");
assert.equal(pickLang(null, "tr-TR"), "tr");
assert.equal(pickLang("ru", null), "ru");
assert.equal(pickLang("ja", null), "tr");

console.log("locales.selftest: ok");
