// node src/lib/desktopUpdateState.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hasDesktopUpdater, statusFromCheck, statusFromEvent, statusFromStatus } from "./desktopUpdateState.js";

// Only desktop shells (Electron preload or the Tauri shim) show the pane.
assert.equal(hasDesktopUpdater(undefined), false);
assert.equal(hasDesktopUpdater({ checkForUpdates() {}, getUpdateStatus() {} }), false, "needs isElectron");
assert.equal(hasDesktopUpdater({ isElectron: true, checkForUpdates() {}, getUpdateStatus() {} }), true);

// check-for-updates answers (Electron main.cjs and Tauri updates.rs shapes).
assert.deepEqual(statusFromCheck({ success: false, error: "offline" }), { status: "error", version: null });
assert.deepEqual(statusFromCheck(null), { status: "error", version: null });
assert.deepEqual(statusFromCheck({ success: true, skipped: true }), { status: "unavailable", version: null });
assert.deepEqual(statusFromCheck({ success: true, updateInfo: null, available: false, updateReady: false }), { status: "upToDate", version: null });
// Electron: updateInfo carries the CURRENT version when nothing is newer; `available` decides.
assert.deepEqual(statusFromCheck({ success: true, updateInfo: { version: "3.10.0" }, available: false }), { status: "upToDate", version: null });
assert.deepEqual(statusFromCheck({ success: true, updateInfo: { version: "4.1.0" }, available: true }), { status: "downloading", version: "4.1.0" });
// Older Tauri shell without `available`.
assert.deepEqual(statusFromCheck({ success: true, updateInfo: { version: "v4.1.0" } }), { status: "downloading", version: "4.1.0" });
assert.deepEqual(statusFromCheck({ success: true, updateReady: true, updateVersion: "4.1.0" }), { status: "ready", version: "4.1.0" });

assert.deepEqual(statusFromStatus({ updateReady: true, updateVersion: "4.2.0" }), { status: "ready", version: "4.2.0" });
assert.deepEqual(statusFromStatus({ updateReady: false }), { status: "idle", version: null });

// Events.
let s = { status: "upToDate", version: null };
s = statusFromEvent(s, "downloading", { version: "4.1.0" });
assert.deepEqual(s, { status: "downloading", version: "4.1.0", percent: 0 });
s = statusFromEvent(s, "progress", { percent: 42.6 });
assert.equal(s.percent, 43);
assert.equal(statusFromEvent(s, "progress", { percent: 250 }).percent, 100);
assert.equal(statusFromEvent(s, "error", { phase: "download" }).status, "error");
assert.equal(statusFromEvent({ status: "upToDate", version: null }, "error", { phase: "check" }).status, "upToDate", "quiet background check");
assert.equal(statusFromEvent({ status: "checking", version: null }, "error", { phase: "check" }).status, "error", "the user is waiting on this check");
assert.deepEqual(statusFromEvent(s, "ready", { version: "4.1.0" }), { status: "ready", version: "4.1.0" });
assert.equal(statusFromEvent(s, "ready", null).version, "4.1.0");

// Mounted in Settings, desktop shells only, strings in every locale.
const panel = readFileSync(new URL("../components/layout/UserPanel.jsx", import.meta.url), "utf8");
assert.match(panel, /id: "desktop", labelKey: "updateToast.settings_title"/);
assert.match(panel, /item\.id === "desktop" && !showDesktopNav/);
assert.match(panel, /case "desktop":\s*return <DesktopUpdatePane \/>/);
const KEYS = ["title", "hint", "version", "check", "checking", "upToDate", "checkFailed", "downloading", "unavailable", "lastChecked"];
for (const loc of ["en", "tr", "de", "es", "fr", "pt-BR", "ru"]) {
  const src = readFileSync(new URL(`../i18n/locales/${loc}.js`, import.meta.url), "utf8");
  const at = src.indexOf('"updateToast": {');
  const block = src.slice(at, src.indexOf("\n  },", at));
  for (const k of KEYS) assert.match(block, new RegExp(`"settings_${k}": "[^"]+"`), `${loc}: updateToast.settings_${k}`);
}

console.log("desktopUpdateState selftest: ok");
