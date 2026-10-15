// Electron boot splash is a frosted glass card, and chat-list names stay one line.
// Run from frontend/: node electron/splash.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const splash = readFileSync(join(here, "splash.html"), "utf8");
const main = readFileSync(join(here, "main.cjs"), "utf8");

assert.match(splash, /descall-icon\.png/);
assert.match(splash, /backdrop-filter:\s*blur\(40px\)/);
assert.match(splash, /prefers-reduced-motion:\s*reduce/);
assert.match(splash, /prefers-reduced-transparency:\s*reduce/);
assert.match(splash, /prefers-contrast:\s*more/);
assert.match(splash, /const omega = \(2 \* Math\.PI\) \/ 0\.36/);
assert.match(splash, /window\.__splashSetVersion/);
assert.match(splash, /window\.__splashUpdate/);
assert.doesNotMatch(splash, /Starting Descall/);
assert.match(splash, /class="loader"/);
assert.match(splash, /class="version"/);

assert.match(main, /backgroundMaterial = 'acrylic'/);
assert.match(main, /vibrancy = 'under-window'/);
assert.match(main, /roundedCorners: true/);
assert.match(main, /transparent: true/);
assert.match(main, /splash\.html/);

console.log("splash.selftest ok");
