// 2.10.109: the admin panel shows the version running on this device.
// Run from frontend/: node src/lib/appVersion.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanVersion, desktopOsName, formatVersionLine, platformLabel, resolveRuntimeVersion } from "./appVersion.js";

assert.equal(cleanVersion("v2.10.109"), "2.10.109");
assert.equal(cleanVersion("garbage"), "");
assert.equal(desktopOsName("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Electron/38"), "Windows");
assert.equal(platformLabel({ nativePlatform: "ios" }), "iOS");
assert.equal(platformLabel({ isElectron: true, userAgent: "Macintosh" }), "macOS");
assert.equal(platformLabel({}), "Web");
assert.equal(formatVersionLine({ version: "2.10.109", platform: "Windows" }), "Sürüm 2.10.109 · Windows");
assert.equal(formatVersionLine({ version: "2.10.109", build: "20261017.1942", platform: "iOS" }), "Sürüm 2.10.109 (20261017.1942) · iOS");
assert.equal(formatVersionLine({ version: "" }), "");

// Electron: app.getVersion over IPC wins over the bundle version.
{
  const win = { navigator: { userAgent: "Windows Electron/38" }, electronAPI: { getVersion: async () => "2.10.109" } };
  assert.deepEqual(await resolveRuntimeVersion({ win }), { version: "2.10.109", build: "", platform: "Windows" });
}
// iOS: bundle version + build from the native plugin.
{
  const cap = { isNativePlatform: () => true, getPlatform: () => "ios", Plugins: { DescallDisplay: { getAppInfo: async () => ({ version: "2.10.109", build: "20261017.2100" }) } } };
  const win = { navigator: { userAgent: "iPhone" }, Capacitor: cap };
  assert.deepEqual(await resolveRuntimeVersion({ win }), { version: "2.10.109", build: "20261017.2100", platform: "iOS" });
}
// Electron IPC failure: never throws, falls back (no build constant in Node → "").
{
  const win = { navigator: { userAgent: "Windows Electron/38" }, electronAPI: { getVersion: async () => { throw new Error("x"); } } };
  const r = await resolveRuntimeVersion({ win });
  assert.equal(r.platform, "Windows");
}

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
// 3.1: the version badge sits in the AdminShell side menu header.
assert.match(read("../components/admin/AdminShell.jsx"), /<AdminVersionBadge t=\{t\} \/>/);
assert.match(read("../i18n/locales/tr.js"), /"App version \{version\}": "Sürüm \{version\}"/);
assert.match(read("../../ios/App/App/DescallDisplayPlugin.swift"), /CFBundleShortVersionString/);
assert.match(read("../../electron/main.cjs"), /ipcMain\.handle\('app-version'/);
assert.doesNotMatch(read("../components/admin/AdminVersionBadge.jsx"), /2\.10\.\d+/, "no hardcoded version");

console.log("appVersion.selftest ok");
