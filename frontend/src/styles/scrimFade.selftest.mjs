// Modal scrims fade in and out together with their panel: no one-frame jump to
// dark, no dark window before the panel, no dim left after it is gone.
// Run: node src/styles/scrimFade.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..");
const read = (rel) => readFileSync(join(src, rel), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");

// Settings: the dim used to finish before the card started ("beforeChildren")
// and start only after the card had left ("afterChildren").
const panel = strip(read("components/layout/UserPanel.jsx").replace(/\/\/.*$/gm, ""));
assert.doesNotMatch(panel, /when:\s*["'](before|after)Children["']/, "settings dim runs in parallel with the card");
assert.match(panel, /const desktopFade = reduceMotion/, "desktop settings fade has a reduced-motion variant");
assert.match(panel, /exit:\s*\{\s*opacity:\s*0,\s*transition:\s*desktopFade\s*\}/, "desktop settings dim fades out with the card");

// Shared scrim entrance: opacity only, backwards fill (never holds a scrim at
// full dim during its exit), shorter with reduced motion.
const overlay = strip(read("styles/overlay.css"));
const base = overlay.slice(0, overlay.indexOf("@supports not"));
assert.match(base, /animation:\s*dc-overlay-fade 180ms ease-out backwards;/, "every scrim fades in");
assert.match(overlay, /@keyframes dc-overlay-fade \{ from \{ opacity: 0; \} to \{ opacity: 1; \} \}/);
const blurDurations = [...overlay.matchAll(/transition:[^;]*/g)]
  .flatMap((m) => [...m[0].matchAll(/backdrop-filter\s+([\d.]+m?s)/g)].map((x) => x[1]));
assert.ok(blurDurations.length > 0 && blurDurations.every((d) => d === "0s"), "the blur itself is never animated (0s, only delayed)");

// Title bar dim: always present and transitioned, so it cannot vanish in one
// frame when the scrim unmounts; no second dim over the glass scrim.
assert.match(overlay, /^\.titlebar::after \{[^}]*opacity:\s*0;[^}]*transition:\s*opacity/m, "title bar dim fades out");
assert.match(overlay, /html\.glass-desktop:not\(\.gd-lite\):not\(\.a11y-solid\) \.titlebar::after \{ background: transparent; \}/);
assert.doesNotMatch(overlay, /\.titlebar::after \{[^}]*animation:/, "no CSS animation that ends the moment :has() stops matching");

// Confirm alerts leave with a fade instead of disappearing.
const alert = read("components/ui/GlassConfirm.jsx");
assert.match(alert, /<AnimatePresence>\s*\{current \?/, "the confirm host keeps the alert mounted for its exit");
assert.match(alert, /exit=\{\{ opacity: 0 \}\}/, "alert scrim exit");
assert.match(alert, /useIsPresent\(\)/, "a leaving alert ignores input");

console.log("scrim fade selftest ok");
