// Strict app-origin checks for navigation and IPC. Run from frontend/: node electron/appTrust.selftest.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { APP_ORIGIN, DEV_ORIGIN, originOf, isAppUrl, isSafeExternalUrl } = require("./appTrust.cjs");

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

console.log("appTrust.selftest: ok");
