// Android app motion (styles/android-motion.css): only transform / opacity
// animate, loading loops are bounded, decorative scene loops hold still, and
// every rule is scoped to html.native-android so iOS / web / desktop keep
// their motion.
// Run: node src/styles/androidMotion.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..");
const read = (rel) => readFileSync(join(src, rel), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");

const css = strip(read("styles/android-motion.css"));

// Imported by the app stylesheet.
assert.match(read("styles.css"), /@import '\.\/styles\/android-motion\.css';/, "android-motion.css is imported");

// The class is set for the Capacitor Android shell only.
const main = read("main.jsx");
assert.match(main, /getPlatform\?\.\(\) === "android"\) document\.documentElement\.classList\.add\("native-android"\)/, "native-android comes from the Android bridge");

// Every selector list starts at html.native-android (no global leak).
const selectors = [...css.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map((m) => m[2].trim()).filter((s) => !/^(from|to|\d+%)/.test(s));
assert.ok(selectors.length > 5, "rules parsed");
for (const sel of selectors) {
  for (const part of sel.split(/,(?![^(]*\))/)) {
    assert.match(part.trim(), /^html\.native-android\b/, `Android-scoped: ${part.trim()}`);
  }
}

// Keyframes only touch compositor properties.
for (const [, body] of css.matchAll(/@keyframes [\w-]+\s*\{([\s\S]*?\})\s*\}/g)) {
  const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
  for (const p of props) assert.ok(["opacity", "transform"].includes(p), `keyframe animates ${p}`);
}

// Skeleton pulse is bounded (never infinite) and off with reduced motion.
const pulse = css.match(/animation:\s*android-sk-pulse[^;]*;/)[0];
assert.doesNotMatch(pulse, /infinite/, "skeleton pulse is bounded");
assert.match(css, /prefers-reduced-motion: reduce[\s\S]*animation:\s*none !important/, "skeletons stop with reduced motion");

// Theme scenes and the glass rim do not loop on Android.
assert.match(css, /\.g-theme-drift,[\s\S]*?\.g-theme-sheen,[\s\S]*?\.g-glass::before,[\s\S]*?\{\s*animation:\s*none !important;/, "theme scene loops are off");

// The jump-to-bottom glass button never animates filter on Android.
const list = read("components/chat/MessageList.jsx");
assert.match(read("lib/motionBlur.js"), /native-android[\s\S]*?\? \{\} :/, "motionBlur is a no-op on Android");
assert.match(list, /\.\.\.motionBlur\(6\)/, "jump button uses motionBlur");
assert.doesNotMatch(list, /filter:\s*"blur\(6px\)"/, "jump button blur goes through motionBlur");

console.log("androidMotion selftest ok");
