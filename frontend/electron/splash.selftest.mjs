// Electron boot splash is a frameless frosted card. Run from frontend/:
// node electron/splash.selftest.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const splash = readFileSync(join(here, "splash.html"), "utf8");
const main = readFileSync(join(here, "main.cjs"), "utf8");
const pkg = readFileSync(join(here, "package.json"), "utf8");

function sliceFn(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, name);
  const end = source.indexOf(`function ${nextName}(`, start);
  assert.notEqual(end, -1, nextName);
  return source.slice(start, end);
}

const win = sliceFn(main, "createSplashWindow", "openMainApp");
assert.match(win, /frame:\s*false/);
assert.match(win, /thickFrame:\s*false/);
assert.match(win, /transparent:\s*true/);
assert.match(win, /backgroundColor:\s*'#00000000'/);
assert.match(win, /roundedCorners:\s*true/);
assert.match(win, /hasShadow:\s*false/);
assert.match(win, /setBackgroundColor\('#00000000'\)/);
assert.match(win, /setHasShadow\(false\)/);
assert.doesNotMatch(win, /backgroundMaterial/);
assert.doesNotMatch(win, /vibrancy/);
assert.doesNotMatch(win, /acrylic/);

for (const phrase of [
  "Güncellemeler denetleniyor…",
  "Descall başlatılıyor…",
  "Güncelleme yükleniyor…",
  "Güncelleme indiriliyor…",
  "Güncel",
  "Güncellemeler denetlenemedi",
]) {
  assert.ok(main.includes(phrase), phrase);
}
assert.doesNotMatch(main, /status:\s*'Checking for updates/);
assert.doesNotMatch(main, /status:\s*'Starting Descall/);
assert.doesNotMatch(main, /status:\s*'Installing update/);
assert.doesNotMatch(main, /status:\s*'Downloading update/);
assert.doesNotMatch(main, /status:\s*'Up to date'/);
assert.doesNotMatch(main, /Couldn’t check for updates/);

// 2.11.14 glass tile: logo-final symbol + wordmark, no app-icon bitmap.
assert.match(splash, /class="logo-wrap" id="logo"/);
assert.match(splash, /class="symbol"/);
assert.match(splash, /#86A0FF/);
assert.match(splash, /class="wordmark"/);
assert.match(splash, /width: 120px;\s*height: 120px;\s*border-radius: 32px;/);
assert.match(splash, /width: 132px;\s*height: 3px;/);
assert.match(splash, /@keyframes sheen/);
assert.match(splash, /let scale = 0\.96;/);
assert.doesNotMatch(splash, /<img src="descall-icon\.png"/);
assert.match(splash, /backdrop-filter:\s*blur\(40px\)/);
assert.match(splash, /background:\s*transparent !important/);
assert.match(splash, /prefers-reduced-motion:\s*reduce/);
assert.match(splash, /prefers-reduced-transparency:\s*reduce/);
assert.match(splash, /prefers-contrast:\s*more/);
assert.match(splash, /const omega = \(2 \* Math\.PI\) \/ 0\.36/);
assert.match(splash, /window\.__splashSetVersion/);
assert.match(splash, /window\.__splashUpdate/);
assert.match(splash, /Güncellemeler denetleniyor…/);
assert.doesNotMatch(splash, /Starting Descall/);
assert.doesNotMatch(splash, /Checking for updates/);
assert.match(splash, /class="loader"/);
assert.match(splash, /class="version"/);
assert.match(splash, /preview"\) === "desktop"/);
assert.match(pkg, /"descall-icon\.png"/);

const brand = readFileSync(join(here, "../public/brand/descall-icon.png"));
const packed = readFileSync(join(here, "descall-icon.png"));
assert.equal(
  createHash("sha256").update(brand).digest("hex"),
  createHash("sha256").update(packed).digest("hex"),
  "splash icon is the Konsept 2 brand asset",
);

console.log("splash.selftest ok");
