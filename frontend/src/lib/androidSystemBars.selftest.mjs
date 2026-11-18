// Android status bar icons follow the app theme. Run: node src/lib/androidSystemBars.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { systemBarsStyleFor, installAndroidSystemBars } from "./androidSystemBars.js";

const src = readFileSync(new URL("./androidSystemBars.js", import.meta.url), "utf8");
installAndroidSystemBars(); // no document in node: must be a no-op, not a throw
assert.equal(systemBarsStyleFor("dark"), "DARK", "dark app: light icons");
assert.equal(systemBarsStyleFor(" light "), "LIGHT", "light app: dark icons");
assert.equal(systemBarsStyleFor(""), "DARK", "classic / unknown stays light icons");
assert.equal(systemBarsStyleFor(undefined), "DARK");
assert.match(src, /getPlatform\(\) === "android"/, "Android only (iOS has its own plugin)");

const config = readFileSync(new URL("../../capacitor.config.ts", import.meta.url), "utf8");
assert.match(config, /SystemBars:\s*\{[^}]*style:\s*"DARK"/, "cold start: light icons before JS runs");
assert.match(config, /initialViewportFitValueHint:\s*"cover"/);

const styles = readFileSync(new URL("../../android/app/src/main/res/values/styles.xml", import.meta.url), "utf8");
assert.ok(!/AppTheme\.NoActionBar" parent="Theme\.AppCompat\.DayNight/.test(styles), "no white DayNight window behind the WebView");
console.log("androidSystemBars.selftest ok");
