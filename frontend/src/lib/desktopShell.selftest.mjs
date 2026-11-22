/**
 * Run: node frontend/src/lib/desktopShell.selftest.mjs
 * Desktop shell detection (Electron / Tauri) and the call sites that use it.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  desktopBridge,
  desktopShellKind,
  isDesktopRuntime,
  isDesktopShell,
  isElectronAppShell,
  isTauriShell,
  premiumBridge,
} from "./desktopShell.js";
import { isElectronShell } from "./entryShell.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const web = {};
const electron = { electronAPI: { isElectron: true, platform: "win32" }, descallPremium: { invoke() {}, on() {} } };
// The Tauri shim: same members as preload.cjs plus a non-enumerable isTauri flag.
const tauriApi = { isElectron: true, platform: "win32" };
Object.defineProperty(tauriApi, "isTauri", { value: true, enumerable: false });
const tauri = { __TAURI_INTERNALS__: { metadata: {} }, electronAPI: Object.freeze(tauriApi), descallPremium: { invoke() {}, on() {} } };
// Tauri with the bridge missing (shim failed): the old checks saw a website here.
const tauriNoBridge = { __TAURI_INTERNALS__: { metadata: {} } };

assert(!isDesktopShell(web) && !isTauriShell(web) && desktopShellKind(web) === "", "browser");
assert(isDesktopShell(electron) && isElectronAppShell(electron) && !isTauriShell(electron), "Electron");
assert(desktopShellKind(electron) === "electron", "Electron kind");
assert(isDesktopShell(tauri) && isTauriShell(tauri) && !isElectronAppShell(tauri), "Tauri with the shim");
assert(desktopShellKind(tauri) === "tauri", "Tauri kind");
assert(!Object.keys(tauriApi).includes("isTauri"), "isTauri stays out of the preload key set");
assert(isTauriShell(tauriNoBridge) && isDesktopShell(tauriNoBridge), "Tauri without its bridge is still the desktop app");
assert(!Boolean(tauriNoBridge.electronAPI?.isElectron), "(the old electronAPI?.isElectron check said web here)");
assert(desktopBridge(tauri) === tauri.electronAPI && desktopBridge(web) === null, "bridge accessor");
assert(premiumBridge(tauri) === tauri.descallPremium && premiumBridge(web) === null, "Descall+ bridge accessor");
assert(!isDesktopShell(null) && !isTauriShell(undefined === undefined ? null : null), "no window");

// Same answers as before wherever the bridge exists (behaviour kept for Electron and Tauri).
for (const w of [web, electron, tauri]) {
  assert(isDesktopShell(w) === Boolean(w.electronAPI?.isElectron), "isDesktopShell == old electronAPI?.isElectron");
  assert(isElectronShell(w) === Boolean(w.electronAPI?.isElectron), "entryShell.isElectronShell unchanged");
}
assert(isDesktopRuntime(web, "Mozilla/5.0 Descall Electron/45.0.0") && !isDesktopRuntime(web, "Mozilla/5.0 Chrome/140"), "Electron UA fallback");
assert(isDesktopRuntime(tauriNoBridge, "Mozilla/5.0 Edg/140"), "Tauri (WebView2 UA) by its globals");
const lockedDown = {};
Object.defineProperty(lockedDown, "__TAURI_INTERNALS__", { get() { throw new Error("blocked"); } });
assert(!isTauriShell(lockedDown), "a throwing global is not the shell");

// The call sites ask the helper instead of the Electron globals.
const src = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITES = {
  "lib/entryShell.js": /isDesktopShell/,
  "lib/webrtcScreenShare.js": /isDesktopShell\(\)/,
  "config/api.js": /isDesktopRuntime\(window\)/,
  "socket.js": /isDesktopRuntime\(window\)/,
  "lib/referral.js": /isDesktopRuntime\(window\)/,
  "main.jsx": /isDesktopShell\(\)/,
  "premium/featureSettings.js": /premiumBridge\(\)/,
  "premium/ui/PremiumAudioKit.jsx": /premiumBridge\(\)/,
  "premium/gaming/bridge.js": /desktopPremiumBridge\(\)/,
};
for (const [file, uses] of Object.entries(SITES)) {
  // Code only: comments may still name the old globals.
  const text = readFileSync(join(src, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert(uses.test(text), `${file} uses lib/desktopShell.js`);
  assert(!/electronAPI(\?\.|\.|\s*&&\s*window\.electronAPI\.)isElectron/.test(text), `${file} no longer detects desktop by electronAPI.isElectron`);
  assert(!/window\.descallPremium/.test(text), `${file} no longer reads window.descallPremium directly`);
}

console.log("desktopShell.selftest: ok");
