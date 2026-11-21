// Tauri title bar (owner reports, desktop 4.0.1): dead window buttons and a blurred bar over
// modals. In html.tauri-app the bar has no CSS drag region (WebView2 made it a native caption
// that swallowed the button clicks), drags through data-tauri-drag-region, and is never blurred.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "titlebar.css"), "utf8");
const jsx = readFileSync(join(here, "..", "components", "TitleBar.jsx"), "utf8");
const shim = readFileSync(join(here, "..", "..", "..", "desktop", "app", "shim", "electron-api-shim.js"), "utf8");

assert.match(jsx, /className="titlebar" role="banner" data-tauri-drag-region="deep"/, "Tauri drags from the bar (buttons excluded by Tauri's drag script)");
assert.match(css, /html\.tauri-app \.titlebar,\s*html\.tauri-app \.titlebar \* \{[^}]*-webkit-app-region:\s*no-drag;[^}]*app-region:\s*no-drag;/, "no WebView2 caption over the bar in Tauri");
assert.match(css, /html\.tauri-app \.titlebar::after \{[^}]*backdrop-filter:\s*none !important;/, "the bar stays sharp over modals in Tauri");
// Electron keeps its drag region.
assert.match(css, /^\.titlebar \{[^}]*-webkit-app-region:\s*drag;/m, "Electron still drags through -webkit-app-region");
assert.match(shim, /classList\.add\("tauri-app"\)/, "the Tauri shim sets html.tauri-app");
console.log("tauriTitlebar.selftest: ok");
