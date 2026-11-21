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

// Every other window bar (admin panel, its loading / sign-in screens, signup stats window,
// app lock) had the same CSS drag region and so the same dead buttons in Tauri.
const read = (...p) => readFileSync(join(here, "..", ...p), "utf8");
const adminShell = read("components", "admin", "AdminShell.jsx");
const adminPage = read("components", "admin", "AdminPanelPage.jsx");
const stats = read("components", "admin", "signupStats", "SignupStatsWindow.jsx");
const lock = read("premium", "gaming", "AppLockScreen.jsx");
assert.match(adminShell, /className="adm-titlebar" data-tauri-drag-region="deep" onDoubleClick=\{titleBarDoubleClick\(/, "admin bar drags in Tauri, no double toggle");
assert.equal((adminPage.match(/adm-state" data-tauri-drag-region="deep"/g) || []).length, 3, "admin loading / error screens drag in Tauri");
assert.match(stats, /className="st-tb" \{\.\.\.\(electron \? \{ "data-tauri-drag-region": "deep" \} : \{\}\)\}/, "signup stats window bar drags in Tauri (only as its own window)");
assert.match(stats, /onDoubleClick=\{electron \? titleBarDoubleClick\(/);
assert.match(lock, /className="pgl-bar" data-tauri-drag-region="deep"/, "app lock bar drags in Tauri");
assert.match(css, /html\.tauri-app \[data-tauri-drag-region\],\s*html\.tauri-app \[data-tauri-drag-region\] \*,\s*html\.tauri-app \.st3 \.st-tb,\s*html\.tauri-app \.st3 \.st-tb \* \{[^}]*-webkit-app-region:\s*no-drag !important;[^}]*app-region:\s*no-drag !important;/, "no native caption under any Tauri drag bar");
// Scene themes give #root z-index 1: inside #root the bar sat under every <body> modal.
// It renders into its own host, the first child of <body> (harness: elementFromPoint over a
// body modal hit the modal with data-theme="emberfall").
assert.match(jsx, /document\.body\.insertBefore\(host, document\.body\.firstChild\)/, "title bar host is a body layer");
assert.match(jsx, /return host \? createPortal\(bar, host\) : bar;/, "title bar is portaled out of #root");
// Restore glyph while maximized (was the same square, smaller).
assert.match(jsx, /isMaximized \? \([\s\S]{0,120}<svg className="win-restore-glyph"/, "restore glyph while maximized");

// titleBarDoubleClick: maximizes in Electron, does nothing in Tauri (the drag script did it).
const { titleBarDoubleClick, inTauriShell } = await import("../lib/windowDrag.js");
let calls = 0;
const handler = titleBarDoubleClick(() => { calls += 1; });
globalThis.window = { electronAPI: { isElectron: true } };
globalThis.document = { documentElement: { classList: { contains: () => false } } };
assert.equal(inTauriShell(), false);
handler({});
assert.equal(calls, 1, "Electron: double-click maximizes");
globalThis.window = { electronAPI: { isElectron: true, isTauri: true } };
assert.equal(inTauriShell(), true);
handler({});
assert.equal(calls, 1, "Tauri: no second toggle");
globalThis.window = {};
globalThis.document = { documentElement: { classList: { contains: (c) => c === "tauri-app" } } };
assert.equal(inTauriShell(), true, "html.tauri-app also counts");
delete globalThis.window;
delete globalThis.document;

console.log("tauriTitlebar.selftest: ok");
