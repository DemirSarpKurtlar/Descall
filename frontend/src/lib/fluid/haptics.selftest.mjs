// iOS haptic helper: one module, semantic kinds, no-op off iOS, no double tick.
// Run: node frontend/src/lib/fluid/haptics.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { shouldEmitHaptic } from "./hapticCoalesce.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "haptics.js"), "utf8");
const compat = readFileSync(join(root, "lib/haptics.js"), "utf8");
const main = readFileSync(join(root, "main.jsx"), "utf8");
const list = readFileSync(join(root, "components/chat/MessageList.jsx"), "utf8");
const app = readFileSync(join(root, "App.jsx"), "utf8");
const call = readFileSync(join(root, "hooks/useCall.js"), "utf8");
const group = readFileSync(join(root, "hooks/useGroupCall.js"), "utf8");

const first = shouldEmitHaptic(null, "selection", 1000);
assert.equal(first.emit, true);
const again = shouldEmitHaptic(first.last, "selection", 1020);
assert.equal(again.emit, false, "same kind inside 50ms collapses");
const later = shouldEmitHaptic(first.last, "selection", 1060);
assert.equal(later.emit, true);
const other = shouldEmitHaptic(first.last, "success", 1010);
assert.equal(other.emit, true, "a different kind still fires");

assert.match(src, /if \(!isNativeIOS\(\)\) return/);
assert.match(src, /selectionStart\(\)/);
assert.match(src, /selectionChanged\(\)/);
assert.match(src, /selectionEnd\(\)/);
assert.match(src, /ImpactStyle\.Light/);
assert.match(src, /ImpactStyle\.Medium/);
assert.match(src, /NotificationType\.Success/);
assert.match(src, /NotificationType\.Warning/);
assert.match(src, /NotificationType\.Error/);
assert.doesNotMatch(src, /Haptics\.vibrate/);
assert.match(src, /function hapticCallConnected/);
// Android: crisp system haptics through the synchronous DescallHaptics bridge
// (View.performHapticFeedback), never the Capacitor vibrator for every press.
const androidPlugin = readFileSync(join(root, "../android/app/src/main/java/com/descall/app/DescallHapticsPlugin.java"), "utf8");
const mainActivity = readFileSync(join(root, "../android/app/src/main/java/com/descall/app/MainActivity.java"), "utf8");
assert.match(src, /window\.DescallHaptics/);
assert.match(src, /hasAndroidSystemHaptics\(\) && mark\(kind\)\) performAndroid\(kind\)/);
assert.match(src, /if \(!isNativeIOS\(\) && !hasAndroidSystemHaptics\(\)\) return;/, "hints only with the bridge on Android");
assert.match(androidPlugin, /addJavascriptInterface\(new HapticsInterface\(view\), "DescallHaptics"\)/);
assert.match(androidPlugin, /@JavascriptInterface/);
assert.match(androidPlugin, /performHapticFeedback\(constant\)/);
assert.doesNotMatch(androidPlugin, /import android\.os\.Vibrat/);
assert.match(mainActivity, /registerPlugin\(DescallHapticsPlugin\.class\)/);
assert.match(mainActivity, /onBackPressed\(\);\s*(?:\}\s*finally\s*\{\s*)?setEnabled\(true\);/, "back callback is re-armed after handing one press to the system");
assert.match(compat, /from "\.\/fluid\/haptics"/);
assert.match(main, /installIosHapticHints\(\)/);

assert.match(list, /hapticImpactMedium\(\)/);
assert.match(list, /onHaptic: \(\) => hapticLight\(\)/);
assert.match(app, /hapticSuccess\(\)/);
assert.match(app, /hapticError\(\)/);
assert.match(call, /hapticCallConnected\(\)/);
assert.match(call, /resetCallHaptic\(\)/);
assert.match(group, /hapticCallConnected\(\)/);
assert.match(group, /resetCallHaptic\(\)/);

console.log("haptics.selftest ok");
