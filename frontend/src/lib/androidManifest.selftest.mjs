/**
 * Run: node frontend/src/lib/androidManifest.selftest.mjs
 * Every android:configChanges flag in the app manifest must be one AAPT knows.
 * "fontWeightAdjust" (the attribute is "fontWeightAdjustment") broke the Android
 * release build at processReleaseResources.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The flags of the configChanges attr in android.jar (API 36).
const VALID = new Set([
  "assetsPaths", "colorMode", "density", "fontScale", "fontWeightAdjustment", "grammaticalGender",
  "keyboard", "keyboardHidden", "layoutDirection", "locale", "mcc", "mnc", "navigation",
  "orientation", "resourcesUnused", "screenLayout", "screenSize", "smallestScreenSize",
  "touchscreen", "uiMode",
]);

const here = dirname(fileURLToPath(import.meta.url));
const manifest = readFileSync(join(here, "../../android/app/src/main/AndroidManifest.xml"), "utf8");
const values = [...manifest.matchAll(/android:configChanges="([^"]*)"/g)].map((m) => m[1]);
assert.ok(values.length > 0, "manifest declares configChanges");
for (const value of values) {
  for (const flag of value.split("|")) {
    assert.ok(VALID.has(flag), `unknown configChanges flag "${flag}"`);
  }
}
assert.ok(values.some((v) => v.split("|").includes("fontWeightAdjustment")), "bold text changes do not recreate the activity");
console.log("androidManifest selftest ok");
