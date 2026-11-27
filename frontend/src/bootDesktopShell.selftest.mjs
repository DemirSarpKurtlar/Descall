// Desktop shells and the boot scripts of index.html (node src/bootDesktopShell.selftest.mjs).
// 1. The Turkish mirror redirect ("/" -> "/tr" for a Turkish boot) is web only. The Tauri app
//    is served at https://tauri.localhost/, so a reload on "/" took a Turkish user from the app
//    to the /tr marketing page inside the desktop window.
// 2. Desktop (ELECTRON_BUILD) builds link the app stylesheet as a real file: with CSS code
//    splitting on, the IIFE bundle injected all app CSS as a runtime <style>, and any time that
//    did not apply the Tauri app came up as raw HTML (75.png / 76.png).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const localize = scripts.find((s) => s.includes("Localize the static cookie bar"));
assert.ok(localize, "cookie bar / mirror script found");

function run({ path, desktop }) {
  const replaced = [];
  const window = { __descallBootLocale: "tr", __descallBootIds: ["en", "tr", "de"], __descallBootCopyFor: () => null };
  if (desktop === "tauri") {
    window.__TAURI_INTERNALS__ = {};
    window.electronAPI = { isElectron: true };
  }
  if (desktop === "electron") window.electronAPI = { isElectron: true };
  const ctx = {
    window,
    location: { pathname: path, search: "", hash: "", replace: (u) => replaced.push(u) },
    document: { documentElement: {}, getElementById: () => null },
  };
  vm.runInNewContext(localize, ctx);
  return replaced;
}

assert.deepEqual(run({ path: "/", desktop: null }), ["/tr"], "web: Turkish boot on / goes to the /tr mirror");
assert.deepEqual(run({ path: "/download", desktop: null }), ["/tr/download"]);
assert.deepEqual(run({ path: "/", desktop: "tauri" }), [], "Tauri app at https://tauri.localhost/: stays in the app");
assert.deepEqual(run({ path: "/download", desktop: "tauri" }), []);
assert.deepEqual(run({ path: "/", desktop: "electron" }), [], "Electron: same");

const vite = readFileSync(new URL("../vite.config.js", import.meta.url), "utf8");
assert.match(vite, /cssCodeSplit: electronBase \? false : true/, "desktop builds emit one linked stylesheet");
assert.match(vite, /<link rel="stylesheet" href="\$1">/, "and link it without CORS mode");
const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
assert.match(styles, /:root \{ --descall-app-css: 1; \}/, "sentinel for the shell's stylesheet watchdog");

console.log("bootDesktopShell.selftest: ok");
