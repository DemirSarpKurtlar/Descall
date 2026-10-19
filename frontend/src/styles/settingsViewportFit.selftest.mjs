// The settings/store card must fit the window it is shown in. Raw 100vh ignores
// the Electron title bar, the shell padding, and the taskbar inset, so a
// non-maximized window cut the card (and the sidebar's logout button) off.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");
const settings = read("settings.css");
const surfaces = read("glass-desktop/surfaces.css");
const titlebar = read("titlebar.css");
const countries = read("countries.css");

assert.match(settings, /--us-safe-top:\s*calc\(var\(--electron-titlebar-h, 0px\) \+ env\(safe-area-inset-top, 0px\)\)/);
assert.match(settings, /--us-safe-bottom:\s*calc\(var\(--electron-bottom-inset, 0px\)/);
assert.match(settings, /--us-avail-h:\s*calc\(100dvh - var\(--us-safe-top\) - var\(--us-safe-bottom\)\)/);
assert.match(settings, /\.user-settings-shell\.is-desktop \{[^}]*padding: var\(--us-safe-top\)/);

// No desktop card height may be sized from raw 100vh any more.
for (const [name, css] of [["settings.css", settings], ["glass-desktop/surfaces.css", surfaces]]) {
  for (const m of css.matchAll(/\.user-settings\.is-desktop[^{]*\{([^}]*)\}/g)) {
    assert.ok(!/(?:^|[\s;])(?:max-)?height:[^;]*100vh/.test(m[1]), `${name}: desktop card height still uses 100vh: ${m[1].trim().slice(0, 120)}`);
  }
}
assert.match(surfaces, /height: min\(960px, var\(--us-fit-h-shop\)\)/);

// The shell covers the window; the safe-top padding clears the title bar once.
assert.match(titlebar, /body\.electron-app \.user-settings-shell\.is-desktop \{[^}]*inset: 0 !important/);

// Purchase dialog stays under the title bar and above the taskbar.
assert.match(countries, /\.cs-dialog \{[^}]*max-height: calc\(var\(--us-avail-h, 100vh\) - 24px\)/);
assert.match(countries, /\.cs-dialog-root \{[^}]*padding: calc\(var\(--us-safe-top, 0px\) \+ 12px\)/);

console.log("settingsViewportFit selftest ok");
