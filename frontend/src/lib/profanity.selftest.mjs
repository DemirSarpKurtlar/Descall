import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Node can't import JSON without an attribute in every version; load the module
// source with the JSON import swapped for an inline object.
const here = dirname(fileURLToPath(import.meta.url));
const json = readFileSync(join(here, "../../backend/config/profanityWords.json"), "utf8");
const src = readFileSync(join(here, "profanity.js"), "utf8").replace(
  /import builtInList from [^;]+;/,
  `const builtInList = ${json};`
);
const mod = await import(`data:text/javascript;base64,${Buffer.from(src).toString("base64")}`);

assert.equal(mod.maskProfanity("what the FUCK"), "what the ***");
assert.equal(mod.maskProfanity("SİKTİR lan amk"), "*** lan ***");
assert.equal(mod.maskProfanity("götürmek sıkıntı"), "götürmek sıkıntı");

// Web / desktop: unchanged.
assert.equal(mod.displayText("shit happens"), "shit happens");

// Native iOS (Capacitor): masked.
globalThis.window = { Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" } };
assert.equal(mod.displayText("shit happens"), "*** happens");
assert.equal(mod.displayText(""), "");
assert.equal(mod.displayText(null), null);
mod.setExtraProfanityWords(["custombad"]);
assert.equal(mod.displayText("a CustomBad b"), "a *** b");

// Android Capacitor: unchanged.
globalThis.window = { Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" } };
assert.equal(mod.displayText("shit happens"), "shit happens");
console.log("profanity selftest ok");
