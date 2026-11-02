// Strict app-origin checks for navigation and IPC. Run from frontend/: node electron/appTrust.selftest.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const { APP_ORIGIN, DEV_ORIGIN, originOf, isAppUrl, isSafeExternalUrl, checkTrustedSender, createSenderGuard } = require("./appTrust.cjs");

const main = readFileSync(new URL("./main.cjs", import.meta.url), "utf8");

// ---- origins ------------------------------------------------------------------------
assert.equal(APP_ORIGIN, "descall://app");
assert.equal(DEV_ORIGIN, "http://localhost:5173");
assert.equal(originOf("descall://app/index.html"), "descall://app");
assert.equal(originOf("descall://APP/settings/shop"), "descall://app");
assert.equal(originOf("http://localhost:5173/settings"), "http://localhost:5173");
assert.equal(originOf("https://descall.com/x"), "https://descall.com");
assert.equal(originOf("descall://app.evil/x"), "descall://app.evil");
assert.equal(originOf("file:///C:/x.html"), null);
assert.equal(originOf("descall://user@app/x"), null, "credentials never match");
assert.equal(originOf("not a url"), null);
assert.equal(originOf(""), null);

// ---- packaged app: only descall://app -----------------------------------------------
const prod = (u) => isAppUrl(u, { isDev: false });
for (const u of ["descall://app/index.html", "descall://app/", "descall://app/settings/shop?x=1#y", "descall://app/admin/panel"]) {
  assert.equal(prod(u), true, `${u} is the app`);
}
for (const u of [
  "https://evil.example/?localhost",
  "https://localhost.evil.example/",
  "http://evil.example/localhost:5173",
  "http://localhost:5173/", // the dev server is not trusted in a packaged build
  "http://localhost/",
  "file:///C:/Users/x/AppData/Local/Temp/a.html",
  "file://localhost/etc/passwd",
  "descall://app.evil/",
  "descall://evil/app",
  "descall://app:8080/",
  "descall://x@app/",
  "https://descall.com/",
  "javascript:alert(1)",
  "data:text/html,<b>x</b>",
  "about:blank",
  "",
  null,
]) {
  assert.equal(prod(u), false, `${u} is not the app`);
}

// ---- dev run: the Vite origin as well, exactly ---------------------------------------
const dev = (u) => isAppUrl(u, { isDev: true });
assert.equal(dev("http://localhost:5173/"), true);
assert.equal(dev("http://localhost:5173/settings/shop"), true);
assert.equal(dev("descall://app/index.html"), true);
for (const u of ["http://localhost:5174/", "https://localhost:5173/", "http://127.0.0.1:5173/", "http://localhost:5173.evil.example/", "http://localhost:5173@evil.example/", "https://evil.example/?localhost"]) {
  assert.equal(dev(u), false, `${u} is not the dev origin`);
}

// ---- what may go to the OS -------------------------------------------------------------
for (const u of ["https://github.com/DemirSarpKurtlar/Descall", "http://example.com", "mailto:contact@descall.com"]) {
  assert.equal(isSafeExternalUrl(u), true, `${u} opens externally`);
}
for (const u of ["file:///C:/Windows/System32/calc.exe", "descall://app/x", "javascript:alert(1)", "ms-settings:privacy", "smb://host/share", "vbscript:x", "", null, "https://"]) {
  assert.equal(isSafeExternalUrl(u), false, `${u} never opens externally`);
}

// ---- wiring in main.cjs ------------------------------------------------------------------
assert.match(main, /require\('\.\/appTrust\.cjs'\)/);
assert.doesNotMatch(main, /includes\('localhost'\)/, "no substring origin test");
assert.doesNotMatch(main, /startsWith\('file:\/\/'\)/, "file:// is not an app page");
const nav = main.slice(main.indexOf("mainWindow.webContents.on('will-navigate'"));
assert.match(nav.slice(0, 600), /if \(isAppUrl\(url, \{ isDev \}\)\) return;\s*event\.preventDefault\(\);/);
// Every OS hand-off goes through the scheme filter.
assert.equal((main.match(/shell\.openExternal\(/g) || []).length, 1, "one shell.openExternal call, inside openExternalSafely");
assert.match(main, /function openExternalSafely\(url, why\) \{\s*if \(!isSafeExternalUrl\(url\)\)/);

// ---- IPC sender validation ------------------------------------------------------------------
const mainWc = { id: 1, isDestroyed: () => false };
const adminWc = { id: 2, isDestroyed: () => false };
const strangerWc = { id: 3, isDestroyed: () => false };
const known = new Set([mainWc, adminWc]);
const isKnownWebContents = (wc) => known.has(wc);
const ev = (sender, url, extra = {}) => ({ sender, senderFrame: url === undefined ? null : { url, parent: null, ...extra } });
const check = (e, isDev = false) => checkTrustedSender(e, { isDev, isKnownWebContents });

assert.equal(check(ev(mainWc, "descall://app/index.html")).ok, true, "main window, app page");
assert.equal(check(ev(adminWc, "descall://app/admin/panel")).ok, true, "admin window, app page");
assert.equal(check(ev(mainWc, "http://localhost:5173/"), true).ok, true, "dev origin in a dev run");
assert.equal(check(ev(mainWc, "http://localhost:5173/")).ok, false, "dev origin refused when packaged");
assert.equal(check(ev(strangerWc, "descall://app/index.html")).reason, "unknown-window", "unknown window");
assert.equal(check(ev(mainWc, "https://evil.example/?localhost")).ok, false, "foreign page in our window");
assert.equal(check(ev(mainWc, "file:///tmp/descall-notif.html")).ok, false, "file:// page");
assert.equal(check(ev(mainWc, "descall://app.evil/")).ok, false);
assert.equal(check(ev(mainWc, "about:blank")).ok, false);
assert.equal(check(ev(mainWc, undefined)).reason, "no-frame", "frame gone");
assert.equal(check(ev(mainWc, "descall://app/index.html", { parent: { url: "descall://app/" } })).reason, "subframe", "subframes never speak for the window");
assert.equal(check({ sender: { isDestroyed: () => true }, senderFrame: { url: "descall://app/", parent: null } }).ok, false, "destroyed sender");
assert.equal(check(null).ok, false);
assert.equal(check({}).ok, false);
assert.equal(check({ sender: mainWc, get senderFrame() { throw new Error("disposed"); } }).reason, "no-frame", "throwing frame getter");
assert.equal(checkTrustedSender(ev(mainWc, "descall://app/"), {}).ok, false, "no window list = nothing is known");
assert.equal(checkTrustedSender(ev(mainWc, "descall://app/"), { isKnownWebContents: () => { throw new Error("x"); } }).ok, false);

const warnings = [];
const guard = createSenderGuard({ isDev: false, isKnownWebContents, log: { warn: (m) => warnings.push(m) } });
assert.equal(guard.isTrustedSender(ev(mainWc, "descall://app/"), "secure-token:get"), true);
assert.equal(guard.isTrustedSender(ev(strangerWc, "descall://app/"), "secure-token:get"), false);
assert.throws(() => guard.assertTrustedSender(ev(mainWc, "https://evil.example/"), "premium:hotkeys"), (err) => err.code === "E_UNTRUSTED_SENDER" && /premium:hotkeys/.test(err.message));
assert.doesNotThrow(() => guard.assertTrustedSender(ev(adminWc, "descall://app/admin/signup-stats"), "secure-token:get"));
guard.isTrustedSender(ev(strangerWc, "descall://app/"), "secure-token:get");
assert.equal(warnings.length, 2, "one warning per channel and reason");
assert.ok(warnings.every((w) => !/eyJ|token=/.test(w)), "no payloads in the log");

// ---- wiring: sensitive channels go through the guard ------------------------------------------
assert.match(main, /function assertTrustedSender\(event, channel = ''\)/);
assert.match(main, /function isDescallWebContents\(wc\) \{\s*return \[mainWindow, signupStatsWindow, adminPanelWindow\]/);
assert.match(main, /function trustedHandle\(channel, handler\) \{\s*ipcMain\.handle\(channel, \(event, \.\.\.args\) => \{\s*assertTrustedSender\(event, channel\);/);
assert.match(main, /function trustedOn\(channel, handler, \{ sync = false, refused = null \} = \{\}\) \{\s*ipcMain\.on\(channel, \(event, \.\.\.args\) => \{\s*try \{\s*assertTrustedSender\(event, channel\);/);
const guarded = {
  "secure-token:get": "trustedOn", "secure-token:set": "trustedOn", "secure-token:clear": "trustedOn",
  "app:locale": "trustedOn", "download-file": "trustedOn", "notification:show": "trustedOn", "notification:close": "trustedOn",
  "show-notification": "trustedHandle", "clipboard:read-image": "trustedHandle", "get-screen-sources": "trustedHandle",
  "check-for-updates": "trustedHandle", "restart-app": "trustedHandle", "restart-app-confirmed": "trustedHandle",
};
for (const [channel, fn] of Object.entries(guarded)) {
  assert.ok(main.includes(`${fn}('${channel}'`), `${channel} is registered with ${fn}`);
  assert.ok(!main.includes(`ipcMain.on('${channel}'`) && !main.includes(`ipcMain.handle('${channel}'`), `${channel} has no bare handler`);
}
// Sync token reads answer the renderer even when refused (sendSync would otherwise hang).
assert.match(main, /trustedOn\('secure-token:get'[\s\S]*?\}, \{ sync: true, refused: null \}\);/);
assert.match(main, /trustedOn\('secure-token:set'[\s\S]*?\}, \{ sync: true, refused: false \}\);/);
assert.match(main, /trustedOn\('secure-token:clear'[\s\S]*?\}, \{ sync: true, refused: false \}\);/);
// scan-processes lives in processScanner.cjs and gets the guard from main.
const scanner = readFileSync(new URL("./processScanner.cjs", import.meta.url), "utf8");
assert.match(scanner, /ipcMain\.handle\('scan-processes', async \(event\) => \{\s*if \(typeof assertSender === 'function'\) assertSender\(event, 'scan-processes'\);/);
assert.match(main, /registerProcessScannerIPC\(\{ assertSender: assertTrustedSender \}\)/);
// Every premium:* channel, now or later, must be registered through the guard.
for (const name of readdirSync(new URL(".", import.meta.url)).filter((f) => f.endsWith(".cjs"))) {
  const src = readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
  assert.doesNotMatch(src, /ipcMain\.(on|once|handle|handleOnce)\(\s*['"`]premium:/, `${name}: premium:* channels use trustedHandle / trustedOn`);
}

console.log("appTrust.selftest: ok");
