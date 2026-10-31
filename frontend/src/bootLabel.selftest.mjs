// B2: the phone splash label must not flip "Yükleniyor" -> "Loading" for Turkish
// users while the i18n catalogs are still loading.
// 3.7.21+: the inline boot copy (index.html) covers every registered locale with the
// same detection rule as src/i18n/detect.js; Turkish keeps window.__descallBootTr.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import vm from "node:vm";

const src = readFileSync(new URL("./main.jsx", import.meta.url), "utf8");
assert.doesNotMatch(src, /^if \(statusEl\) statusEl\.textContent = /m, "unguarded boot label overwrite is back");
assert.match(src, /if \(statusEl && !window\.__descallBootTr\) statusEl\.textContent = window\.__descallBootCopy\?\.waitLabel \|\| "Loading";/);
assert.doesNotMatch(src, /i18n\/index\.js["']\s*;?\s*$/m, "main.jsx must not statically import the catalogs");

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert.doesNotMatch(html, /status\.textContent = "Ready";/, "hide path must not force English for Turkish users");
assert.equal(html.match(/status\.textContent = \(window\.__descallBootCopy \|\| \{\}\)\.ready \|\| "Ready"/g)?.length, 2, "both splash hide paths use the boot copy");
assert.match(html, /window\.__descallBootTr = locale === "tr";/);

// Every registered locale has the same boot words; BOOT_LIVE = live ids of locales.json.
const registry = JSON.parse(readFileSync(new URL("./i18n/locales.json", import.meta.url), "utf8"));
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes("Boot locale: splash and cookie-bar words"));
assert.ok(script, "boot locale script present");
const live = JSON.parse(script.match(/var BOOT_LIVE = (\[[^\]]*\]);/)[1]);
assert.deepEqual(live, registry.locales.filter((l) => l.status === "live").map((l) => l.id), "BOOT_LIVE matches locales.json");
const ids = JSON.parse(script.match(/var ids = (\[[^\]]*\]);/)[1]);
assert.deepEqual(ids, registry.locales.map((l) => l.id), "boot table ids = registered locales");

function bootLocale({ stored = {}, languages = ["en-US"], tz = "UTC" } = {}) {
  const store = new Map(Object.entries(stored));
  const window = {};
  const ctx = vm.createContext({
    window,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null) },
    navigator: { language: languages[0], languages },
    Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: tz }) }) },
    JSON, String,
  });
  vm.runInContext(script, ctx);
  return window;
}

const keys = Object.keys(bootLocale().__descallBootCopy);
for (const id of ids) {
  const w = bootLocale({ stored: { descall_language: id, descall_i18n_preview: "1" } });
  assert.equal(w.__descallBootLocale, id);
  assert.deepEqual(Object.keys(w.__descallBootCopy), keys, `${id} has every boot word`);
  for (const k of keys) assert.ok(w.__descallBootCopy[k], `${id}.${k}`);
}
const tr = bootLocale({ languages: ["tr-TR"] });
assert.equal(tr.__descallBootLocale, "tr");
assert.equal(tr.__descallBootTr, true);
assert.doesNotMatch(html, /\bloading\b/i, "shipped HTML must not carry the English placeholder word (seo-validate)");
const splash = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes("Boot splash only, prerender strips this"));
const loadingWords = JSON.parse(splash.match(/var BOOT_WAIT = (\{[^}]*\});/)[1]);
assert.equal(loadingWords.tr, "Yükleniyor", "inline splash still sets the Turkish label");
assert.deepEqual(Object.keys(loadingWords).sort(), ids.filter((id) => id !== "en").sort(), "a wait label for every non-English locale");
assert.match(splash, /bootLabel\.textContent = bootCopyText\.waitLabel;/);
assert.equal(tr.__descallBootCopy.ready, "Hazır");
assert.equal(bootLocale({ tz: "Europe/Istanbul" }).__descallBootLocale, "tr", "Turkey time zone -> tr");
assert.equal(bootLocale({ languages: ["en-TR"] }).__descallBootLocale, "tr", "-TR region -> tr");
assert.equal(bootLocale({ stored: { descall_language: "en" }, languages: ["tr-TR"] }).__descallBootLocale, "en", "stored choice wins");
assert.equal(bootLocale({ stored: { descall_user_settings: '{"language":"tr"}' } }).__descallBootLocale, "tr", "settings copy");
assert.equal(bootLocale({ languages: ["de-DE"] }).__descallBootLocale, "de", "live German from the device language");
assert.equal(bootLocale({ languages: ["ja-JP"] }).__descallBootLocale, "en", "unsupported language -> English");
assert.equal(bootLocale({ languages: ["de-AT"], stored: { descall_i18n_preview: "1" } }).__descallBootLocale, "de");
assert.equal(bootLocale({ languages: ["pt-PT"], stored: { descall_i18n_preview: "1" } }).__descallBootLocale, "pt-BR");
assert.equal(bootLocale({ languages: ["ja-JP"] }).__descallBootLocale, "en");
assert.equal(bootLocale().__descallBootTr, false);
console.log("bootLabel.selftest ok");
