// Signed out, the sign-in page uses Descall's own look, not the last account's shop theme.
// Run: node src/lib/signedOutAppearance.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_ACCENT, LEGACY_SETTINGS_KEY, SETTINGS_KEY, readAppearance } from "./appearancePrefs.js";
import { forgetAccountLook, withoutAccountLook } from "./appearanceSync.js";

const here = dirname(fileURLToPath(import.meta.url));

function memStore(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

// 1) The pure strip keeps the person's accessibility choices and drops the account's look.
const blob = {
  premiumThemeKey: "aurora",
  accentColor: "#ff4fa3",
  themeMode: "light",
  darkMode: false,
  appearanceUpdatedAt: "2026-11-27T10:00:00.000Z",
  fontStep: 2,
  reduceMotion: true,
  reduceTransparency: true,
  chatFontSize: 16,
};
const stripped = withoutAccountLook(blob);
for (const k of ["premiumThemeKey", "accentColor", "themeMode", "darkMode", "appearanceUpdatedAt"]) {
  assert.equal(Object.hasOwn(stripped, k), false, `${k} is dropped`);
}
assert.equal(stripped.fontStep, 2, "text size stays");
assert.equal(stripped.reduceMotion, true, "reduce motion stays");
assert.equal(stripped.reduceTransparency, true, "reduce transparency stays");
assert.equal(blob.premiumThemeKey, "aurora", "the input is not mutated");
assert.deepEqual(withoutAccountLook(null), {}, "garbage in, empty blob out");

// 2) forgetAccountLook writes both cache keys; what is left reads as the default look.
const store = memStore({ [SETTINGS_KEY]: JSON.stringify(blob), [LEGACY_SETTINGS_KEY]: JSON.stringify(blob) });
forgetAccountLook(store);
for (const key of [SETTINGS_KEY, LEGACY_SETTINGS_KEY]) {
  const saved = JSON.parse(store.getItem(key));
  assert.equal(saved.premiumThemeKey, undefined, `${key}: no shop theme`);
  assert.equal(saved.appearanceUpdatedAt, undefined, `${key}: no local time, so the next sign-in pulls the account copy`);
  assert.equal(saved.fontStep, 2, `${key}: text size kept`);
}
const after = readAppearance(store);
assert.equal(after.themeMode, "dark", "default mode after forgetting");
assert.equal(after.accentColor, DEFAULT_ACCENT, "default accent after forgetting");

// 3) The boot script (main.jsx) paints from the same cache: no premium key means plain dark.
const boot = JSON.parse(store.getItem(SETTINGS_KEY));
const bootTheme = boot.premiumThemeKey || (boot.darkMode === false ? "light" : "dark");
assert.equal(bootTheme, "dark", "a cold start after sign-out paints dark");

// 4) Wiring: logout forgets, and every signed-out state applies the default look.
const app = readFileSync(join(here, "..", "App.jsx"), "utf8");
assert.match(app, /applySignedOutAppearance\(\{ forget: true \}\)/, "handleLogout forgets the account's look");
assert.match(app, /if \(me \|\| !sessionChecked\) return;\s*try \{\s*applySignedOutAppearance\(\);/, "signed-out screens apply the default look once the session check is done");

console.log("signedOutAppearance.selftest: ok");
