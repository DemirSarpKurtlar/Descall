// public/404.html is static (no bundle): public/404-locale.js picks its words with the
// same rule as src/i18n/detect.js. Run: node src/site404Locale.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const page = readFileSync(new URL("../public/404.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../public/404-locale.js", import.meta.url), "utf8");
const registry = JSON.parse(readFileSync(new URL("./i18n/locales.json", import.meta.url), "utf8"));
assert.match(page, /<script src="\/404-locale\.js"><\/script>/, "404 page loads its locale file (no inline script, CSP stays hash-only)");
assert.doesNotMatch(page, /<script>/, "no inline script on the 404 page");
assert.deepEqual(JSON.parse(script.match(/var LIVE = (\[[^\]]*\]);/)[1]), registry.locales.filter((l) => l.status === "live").map((l) => l.id));
assert.deepEqual(JSON.parse(script.match(/var ids = (\[[^\]]*\]);/)[1]), registry.locales.map((l) => l.id));
const keys = [...page.matchAll(/data-i18n="(\w+)"/g)].map((m) => m[1]);
assert.deepEqual(keys.sort(), ["body", "download", "home"]);

function render({ stored = {}, languages = ["en-US"], tz = "UTC", pathname = "/nope" } = {}) {
  const store = new Map(Object.entries(stored));
  const nodes = keys.map((k) => ({ key: k, textContent: "", getAttribute: () => k }));
  const document = { documentElement: {}, title: "", querySelectorAll: () => nodes };
  vm.runInContext(script, vm.createContext({
    document, location: { pathname },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null) },
    navigator: { language: languages[0], languages },
    Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: tz }) }) },
    JSON, String,
  }));
  return { lang: document.documentElement.lang, title: document.title, text: Object.fromEntries(nodes.map((n) => [n.key, n.textContent])) };
}

assert.equal(render().lang, "en");
const tr = render({ languages: ["tr-TR"] });
assert.equal(tr.lang, "tr");
assert.equal(tr.text.body, "Bu sayfa Descall’da yok.");
assert.equal(render({ tz: "Europe/Istanbul" }).lang, "tr");
assert.equal(render({ pathname: "/tr/nope" }).lang, "tr", "Turkish URL");
assert.equal(render({ stored: { descall_language: "en" }, languages: ["tr-TR"] }).lang, "en", "stored choice wins");
assert.equal(render({ languages: ["fr-FR"] }).lang, "fr", "live French from the device language");
assert.equal(render({ languages: ["ja-JP"] }).lang, "en", "unsupported language -> English");
for (const l of registry.locales) {
  const r = render({ stored: { descall_language: l.id, descall_i18n_preview: "1" } });
  assert.equal(r.lang, l.id);
  for (const k of keys) assert.ok(r.text[k], `${l.id}.${k}`);
  assert.match(r.title, /\| Descall$/);
}
console.log("site404Locale.selftest ok");
