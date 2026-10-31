// Main-process i18n (electron/mainI18n.cjs + electron/i18n/<id>.json). Run from frontend/:
// node electron/mainI18n.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const i18n = require("./mainI18n.cjs");
const registry = JSON.parse(readFileSync(join(here, "../src/i18n/locales.json"), "utf8"));

// 1. One complete catalog per registered locale: same key tree, same placeholders, no empty text.
function flatten(node, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}
const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const en = flatten(JSON.parse(readFileSync(join(here, "i18n", "en.json"), "utf8")));
assert.deepEqual(i18n.LOCALE_IDS, registry.locales.map((l) => l.id), "ids come from src/i18n/locales.json");
for (const { id } of registry.locales) {
  const cat = flatten(JSON.parse(readFileSync(join(here, "i18n", `${id}.json`), "utf8")));
  assert.deepEqual(Object.keys(cat).sort(), Object.keys(en).sort(), `${id}: same keys as en`);
  for (const [key, text] of Object.entries(cat)) {
    assert.ok(typeof text === "string" && text.trim(), `${id}.${key} empty`);
    assert.equal(placeholders(text), placeholders(en[key]), `${id}.${key} placeholders`);
    // Translated, not copied from English (brand-only titles and same-spelled words excepted).
    const sameEverywhere = ["window.adminPanel", "notif.message"];
    if (id !== "en" && !sameEverywhere.includes(key)) assert.notEqual(text, en[key], `${id}.${key} still English`);
  }
}
// Turkish wording is the owner-approved text that used to be in the code.
const tr = flatten(JSON.parse(readFileSync(join(here, "i18n", "tr.json"), "utf8")));
assert.equal(tr["tray.open"], "Descall'i Aç");
assert.equal(tr["tray.startWithWindows"], "Windows ile Başlat");
assert.equal(tr["tray.updateAndQuit"], "Güncelle ve Çık (v{version})");
assert.equal(tr["notice.background"], "Descall arka planda çalışmaya devam ediyor. Simge durumundan geri açabilirsin.");
assert.equal(tr["dialog.loadFailedDetail"], "Uygulama dosyaları açılamadı ({detail}). Tekrar deneyebilir veya Descall'ı kapatabilirsin.");

// 2. Language choice.
const live = registry.locales.filter((l) => l.status === "live").map((l) => l.id);
const draft = registry.locales.find((l) => l.status === "draft");
assert.equal(i18n.resolveLocale({ ui: "tr" }), "tr", "UI language wins");
assert.equal(i18n.resolveLocale({ ui: "en", os: ["tr-TR"] }), "en", "UI language wins over the OS");
assert.equal(i18n.resolveLocale({ ui: "pt", os: [] }), "pt-BR", "base language match");
assert.equal(i18n.resolveLocale({ os: ["tr-TR"] }), "tr", "Turkish device keeps Turkish");
assert.equal(i18n.resolveLocale({ os: ["en-US", "tr"] }), "tr", "any Turkish device language");
assert.equal(i18n.resolveLocale({ os: ["en-US"], timeZone: "Europe/Istanbul" }), "tr", "Turkey time zone");
assert.equal(i18n.resolveLocale({ os: ["en-GB"] }), "en");
assert.equal(i18n.resolveLocale({ os: ["ja-JP"] }), "en", "unknown -> English");
assert.equal(i18n.resolveLocale({}), "en");
if (draft) {
  assert.equal(i18n.resolveLocale({ os: [`${draft.id}`] }), "en", "draft OS match -> English");
  assert.equal(i18n.resolveLocale({ ui: draft.id }), draft.id, "a draft the UI chose (preview) is used");
}
for (const id of live) assert.equal(i18n.resolveLocale({ os: [id] }), id, `live ${id}`);
assert.equal(i18n.matchLocale("xx-YY"), null);
assert.equal(i18n.matchLocale("de_AT"), "de");

// 3. Lookup, interpolation, fallback, change listeners, persistence.
i18n.setLocale("tr");
assert.equal(i18n.et("tray.updateAndQuit", { version: "3.7.22" }), "Güncelle ve Çık (v3.7.22)");
assert.equal(i18n.etFor("ru", "tray.quit"), "Выйти");
assert.equal(i18n.et("no.such.key"), "no.such.key");
let seen = null;
const off = i18n.onLocaleChange((id) => { seen = id; });
assert.equal(i18n.setUiLocale("fr-FR"), true);
assert.equal(seen, "fr");
assert.equal(i18n.et("dialog.retry"), "Réessayer");
assert.equal(i18n.setUiLocale("fr"), false, "same language: no change event");
assert.equal(i18n.setUiLocale("zz"), false, "unknown language ignored");
off();
const dir = mkdtempSync(join(tmpdir(), "descall-i18n-"));
writeFileSync(join(dir, "ui-locale.json"), JSON.stringify({ locale: "es" }));
assert.equal(i18n.initLocale({ userDataDir: dir, osLanguages: ["tr-TR"] }), "es", "last UI language before the OS");
i18n.setUiLocale("de");
assert.equal(JSON.parse(readFileSync(join(dir, "ui-locale.json"), "utf8")).locale, "de", "remembered for the next splash");

// 4. Overlay carries every locale; window titles and tray use the catalogs.
const { STRINGS } = require("./overlayHtml.cjs");
assert.deepEqual(Object.keys(STRINGS), i18n.LOCALE_IDS);
assert.equal(STRINGS.tr.deafen, "Sağırlaştır");
assert.equal(STRINGS.de.end, "Anruf beenden");
i18n.setLocale("tr");
const win = require("./adminStatsWindow.cjs");
assert.equal(win.signupStatsWindowOptions({}).title, "Kayıt İstatistikleri — Descall Yönetici");
assert.equal(win.adminPanelWindowOptions({}).title, "Descall Yönetici");

// 5. Wiring: renderer -> preload -> 'app:locale' -> tray / overlay refresh.
const main = readFileSync(join(here, "main.cjs"), "utf8");
const preload = readFileSync(join(here, "preload.cjs"), "utf8");
const ctx = readFileSync(join(here, "../src/context/LocaleContext.jsx"), "utf8");
assert.match(preload, /setLocale: \(locale\) => ipcRenderer\.send\('app:locale'/);
assert.match(ctx, /window\.electronAPI\?\.setLocale\?\.\(locale\)/);
assert.match(main, /ipcMain\.on\('app:locale'/);
assert.match(main, /onLocaleChange\(\(\) => \{\s*rebuildTrayMenu\?\.\(\);\s*refreshOverlayLanguage\(\);/);
assert.match(main, /initLocale\(\{ userDataDir: app\.getPath\('userData'\), osLanguages \}\)[\s\S]*await createSplashWindow\(\)/, "language known before the splash");
assert.match(main, /label: et\('tray\.open'\)/);
assert.match(main, /label: updateReady \? et\('tray\.updateAndQuit', \{ version: updateVersion \|\| '' \}\) : et\('tray\.quit'\)/);
assert.doesNotMatch(main, /'[^'\n]*[çğıöşüÇĞİÖŞÜ][^'\n]*'/, "no Turkish string literal left in main.cjs");
const pkg = JSON.parse(readFileSync(join(here, "../package.json"), "utf8"));
assert.ok(pkg.build.files.includes("src/i18n/locales.json"), "registry packaged with the app");

console.log("mainI18n.selftest ok");
