// descall:// path resolution from any route depth (2.13.1). Run from frontend/: node electron/appProtocolPath.selftest.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { resolveDistFile, resolveLegacyAppFile } = require("./appProtocolPath.cjs");

const root = path.resolve("/tmp/descall-dist");
const files = new Set(["index.html", "assets/index-abc.js", "brand/descall-symbol-gradient.svg", "brand/descall-wordmark-white.svg", "brand/descall-icon.png", "fonts/TwemojiCountryFlags.woff2"].map((f) => path.join(root, f)));
const exists = (p) => files.has(p);
const r = (p) => resolveDistFile(root, p, exists);
const rel = (p) => path.relative(root, r(p).filePath).split(path.sep).join("/");

assert.equal(rel("/"), "index.html");
assert.equal(rel("/index.html"), "index.html");
assert.equal(r("/settings/shop").spa, true, "SPA route serves the app document");
assert.equal(rel("/settings/shop"), "index.html");
assert.equal(rel("/servers/1/2"), "index.html");
assert.equal(rel("/assets/index-abc.js"), "assets/index-abc.js");

// The 2.13.0 bug: a reload on /settings/shop asks for these. They must resolve.
assert.equal(rel("/settings/assets/index-abc.js"), "assets/index-abc.js");
assert.equal(rel("/settings/brand/descall-symbol-gradient.svg"), "brand/descall-symbol-gradient.svg");
assert.equal(rel("/settings/brand/descall-wordmark-white.svg"), "brand/descall-wordmark-white.svg");
assert.equal(rel("/servers/a/b/brand/descall-icon.png"), "brand/descall-icon.png");
assert.equal(rel("/direct/someone/fonts/TwemojiCountryFlags.woff2"), "fonts/TwemojiCountryFlags.woff2");
assert.equal(r("/settings/assets/index-abc.js").rewritten, true);
assert.equal(r("/assets/index-abc.js").rewritten, false);
assert.equal(rel("/settings/brand/descall%2Dicon.png"), "brand/descall-icon.png", "percent-encoded names");

// Missing files stay missing (404 from net.fetch), never another file.
assert.equal(rel("/assets/nope.js"), "assets/nope.js");
assert.equal(r("/assets/nope.js").forbidden, false);

// Never outside dist/.
assert.equal(r("/..%2F..%2Fetc%2Fpasswd.txt").forbidden, true);
assert.equal(r("/a/../../b.js").forbidden, true);
for (const p of ["/../secret.txt", "/..%2F..%2Fetc%2Fpasswd.txt", "/x/..%2F..%2Fy.js"]) {
  const out = r(p);
  assert.ok(out.forbidden || out.filePath.startsWith(root + path.sep), `${p} stays in dist`);
}

// Wiring: the protocol handler uses it, and it ships in the packaged app.
const main = readFileSync(new URL("./main.cjs", import.meta.url), "utf8");
assert.match(main, /require\('\.\/appProtocolPath\.cjs'\)/);
assert.match(main, /protocol\.handle\('descall'[\s\S]*?resolveDistFile\(root, url\.pathname/);
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
assert.ok(pkg.build.files.includes("electron/**/*"), "electron/*.cjs is packaged");

// Legacy app:// (sounds next to electron/): same root rule, '..' never escapes.
const legacyRoot = path.resolve("/tmp/descall-app");
const legacy = (u) => resolveLegacyAppFile(legacyRoot, u);
const legacyRel = (u) => path.relative(legacyRoot, legacy(u).filePath).split(path.sep).join("/");
assert.equal(legacyRel("app://sounds/message.mp3"), "sounds/message.mp3");
assert.equal(legacyRel("app://public/sounds/ring.ogg?v=2#t"), "public/sounds/ring.ogg", "query and hash dropped");
assert.equal(legacyRel("app://sounds/my%20ring.mp3"), "sounds/my ring.mp3", "percent-encoded names");
assert.equal(legacyRel("APP://sounds/a.mp3"), "sounds/a.mp3");
for (const u of [
  "app://../secret.txt",
  "app://../../etc/passwd",
  "app://sounds/../../etc/passwd",
  "app://..%2F..%2Fetc%2Fpasswd",
  "app://sounds/%2e%2e/%2e%2e/x",
  "app://sounds\\..\\..\\x.bat",
  "app://..\\..\\AppData\\x.bat",
  "app://C:/Windows/win.ini",
  "app://c%3A%5CWindows%5Cwin.ini",
  "app://sounds/a%00.mp3",
  "app://",
  "app://.",
  "",
]) {
  const out = legacy(u);
  assert.equal(out.forbidden, true, `${JSON.stringify(u)} is refused`);
  assert.equal(out.filePath, null);
}
// Whatever comes in, an accepted path is inside the root.
for (const u of ["app:///etc/passwd", "app://a/./b/../c.mp3", "app://a//b.mp3"]) {
  const out = legacy(u);
  assert.ok(out.forbidden || out.filePath.startsWith(legacyRoot + path.sep), `${u} stays in the root`);
}
assert.match(main, /registerFileProtocol\('app'[\s\S]*?resolveLegacyAppFile\(legacyRoot, request\.url\)/, "app:// handler uses the resolver");
assert.doesNotMatch(main, /path\.join\(__dirname, '\.\.', url\)/, "the unchecked join is gone");

console.log("appProtocolPath.selftest: ok");
