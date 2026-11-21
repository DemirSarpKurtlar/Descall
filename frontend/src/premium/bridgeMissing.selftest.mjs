// Settings > Descall+ inside the desktop app without the Descall+ bridge (its script did not
// load, as in Tauri desktop-v4.0.1): a clear "connection did not start" state, never
// "available in the desktop app". Run: node src/premium/bridgeMissing.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
globalThis.window = {};
const { desktopBridgeMissing, isDesktopApp } = await import("./featureSettings.js");

assert.equal(desktopBridgeMissing(), false, "web: not missing");
window.__TAURI_INTERNALS__ = {};
assert.equal(desktopBridgeMissing(), true, "Tauri shell without descallPremium");
window.descallPremium = { invoke() {}, on() {} };
assert.equal(desktopBridgeMissing(), false, "Tauri with the bridge");
assert.equal(isDesktopApp(), true);
globalThis.window = { electronAPI: {} };
assert.equal(desktopBridgeMissing(), true, "Electron preload without descallPremium");
globalThis.window = { isTauri: true };
assert.equal(desktopBridgeMissing(), true, "window.isTauri alone");

const tab = readFileSync(join(here, "PremiumSettingsTab.jsx"), "utf8");
assert.match(tab, /data-testid="premium-bridge-missing"/, "notice with a test id");
assert.match(tab, /code: "bridge-missing"/, "notice shows the code");
assert.equal((tab.match(/bridgeMissing \? <BridgeMissingNotice \/> : null/g) || []).length, 2, "on the home and the category view");
assert.match(tab, /desktopBridgeMissing\(\) \? "premium\.hub\.bridge\.tile" : "premium\.hub\.desktopOnly"/, "tile foot");
assert.match(readFileSync(join(here, "story", "StoryCategory.jsx"), "utf8"), /desktopBridgeMissing\(\) \? "premium\.hub\.bridge\.pill"/, "feature pill");

const locales = join(here, "..", "i18n", "locales");
for (const f of ["premium.tr.js", "premium.en.js", "de.js", "es.js", "fr.js", "pt-BR.js", "ru.js"]) {
  const src = readFileSync(join(locales, f), "utf8");
  const at = src.indexOf('"bridge": {');
  assert.ok(at > 0, `${f}: premium.hub.bridge`);
  const block = src.slice(at, src.indexOf("}", at));
  for (const k of ["title", "body", "pill", "tile", "reload"]) assert.match(block, new RegExp(`"${k}": "[^"]{2,}"`), `${f}: bridge.${k}`);
}
console.log("bridgeMissing.selftest: ok");
