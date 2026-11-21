// Android app design parity: Inter (the mockup face) and the status-bar gap.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "android-native.css"), "utf8");
const main = readFileSync(join(here, "..", "main.jsx"), "utf8");

// Loaded only in the Android app, next to the app styles.
assert.match(main, /isNativeAndroid \? import\("\.\/styles\/android-native\.css"\)/, "main.jsx loads android-native.css only on Android");
assert.match(main, /getPlatform\?\.\(\) === "android"/, "isNativeAndroid checks the Capacitor platform");
assert.match(main, /classList\.add\("native-android"\)/, "html.native-android marks the Android app");

// Inter faces at every weight the glass UI asks for, local files that exist.
const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
assert.equal(faces.length, 12, "400 / 500 / 600 / 700 x latin + latin-ext + cyrillic");
for (const w of [400, 500, 600, 700]) {
  for (const sub of ["latin", "latin-ext", "cyrillic"]) {
    const face = faces.find((f) => f.includes(`font-weight: ${w};`) && f.includes(`inter-${sub}-${w}-normal.woff2`));
    assert(face, `Inter ${w} ${sub}`);
    assert.match(face, /font-family: "Inter";/);
    assert.match(face, /font-display: fallback;/, "short block, swap only during boot");
    assert.match(face, /unicode-range:/, "only the subset a glyph needs is loaded");
    const url = face.match(/url\("([^"]+)"\)/)[1];
    assert(existsSync(resolve(here, url)), `font file ships: ${url}`);
  }
}

// Status bar: the toolbar starts below it, with a gap when the WebView pads instead (inset 0).
assert.match(css, /html\.glass-ui\.native-android\s*\{\s*--g-chrome-top: max\(8px, calc\(env\(safe-area-inset-top, 0px\) \+ 4px\)\);/);
// Nothing here may leak to iOS / web: every rule outside @font-face is scoped to native-android.
const rules = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@font-face\s*\{[^}]*\}/g, "");
for (const m of rules.matchAll(/([^{}]+)\{/g)) assert.match(m[1], /native-android/, `scoped: ${m[1].trim()}`);

// Native accent: brand blue on the theme the activity actually uses (selection handles, caret).
const res = join(here, "..", "..", "android", "app", "src", "main", "res", "values");
const colors = readFileSync(join(res, "colors.xml"), "utf8");
const styles = readFileSync(join(res, "styles.xml"), "utf8");
assert.match(colors, /<color name="colorAccent">#587AF6<\/color>/, "accent is the glass brand blue");
const noActionBar = styles.slice(styles.indexOf('name="AppTheme.NoActionBar"'), styles.indexOf('name="AppTheme.NoActionBarLaunch"'));
assert.match(noActionBar, /<item name="colorAccent">@color\/colorAccent<\/item>/, "the activity theme carries the accent");
assert.match(noActionBar, /<item name="colorControlActivated">@color\/colorAccent<\/item>/);
// Behind the WebView (system bars on WebView < 140, keyboard gaps): the glass base, not the grey launch tile.
assert.match(colors, /<color name="window_background">#101118<\/color>/);
assert.match(noActionBar, /<item name="android:windowBackground">@color\/window_background<\/item>/);
const launch = styles.slice(styles.indexOf('name="AppTheme.NoActionBarLaunch"'));
assert.match(launch, /windowSplashScreenBackground">@color\/splash_background</, "the launch splash keeps its own surface");

// System font scale must not multiply the glass chrome (the iPhone WebView does not either).
const mainActivity = readFileSync(join(here, "..", "..", "android", "app", "src", "main", "java", "com", "descall", "app", "MainActivity.java"), "utf8");
assert.match(mainActivity, /getWebView\(\)\.getSettings\(\)\.setTextZoom\(100\);/, "Android WebView text zoom pinned to 100");
assert(mainActivity.indexOf("setTextZoom(100)") > mainActivity.indexOf("super.onCreate("), "after the bridge creates the WebView");

console.log("androidNative.selftest: ok");
