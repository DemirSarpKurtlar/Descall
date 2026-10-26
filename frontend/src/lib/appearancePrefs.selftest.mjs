// Settings › Görünüm (3.0): stored shapes, account patch rules, shortcuts.
// Run: node src/lib/appearancePrefs.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCENTS,
  FONT_STEPS,
  normalizeAppearance,
  sanitizeAppearancePatch,
  fontStepFromLegacyPx,
  normalizeAccent,
  readAppearance,
  writeAppearance,
  fontScale,
} from "./appearancePrefs.js";
import { fontStepForShortcut } from "./appearanceSync.js";

const here = dirname(fileURLToPath(import.meta.url));

function memStore(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

// The 7 approved swatches, Descall blue first.
assert.deepEqual(ACCENTS.map((a) => a.hex), ["#587AF6", "#8E6CF6", "#30B05A", "#14B8A6", "#EC4899", "#F5A524", "#EF4444"]);
assert.deepEqual(FONT_STEPS.map((s) => s.label), ["Küçük", "Varsayılan", "Büyük", "Çok büyük"]);
assert.equal(fontScale(1), 1);
assert.ok(fontScale(0) < 1 && fontScale(3) > fontScale(2));

// 2.x settings carry over.
assert.equal(normalizeAccent("#5865F2"), "#587AF6");
assert.equal(normalizeAccent("#23a55a"), "#30B05A");
assert.equal(normalizeAccent("javascript:alert(1)"), "#587AF6");
assert.equal(fontStepFromLegacyPx(12), 0);
assert.equal(fontStepFromLegacyPx(14), 1);
assert.equal(fontStepFromLegacyPx(16), 2);
assert.equal(fontStepFromLegacyPx(20), 3);
assert.deepEqual(normalizeAppearance({ darkMode: false, accentColor: "#EB459E", chatFontSize: 16, uiDensity: "compact" }), {
  themeMode: "light",
  accentColor: "#EC4899",
  fontStep: 2,
  reduceTransparency: false,
  reduceMotion: false,
});
assert.equal(normalizeAppearance({}).themeMode, "dark");
assert.equal(normalizeAppearance({ themeMode: "auto", darkMode: true }).themeMode, "auto");

// Account patches: only well-formed keys survive.
assert.deepEqual(sanitizeAppearancePatch({ themeMode: "auto", accentColor: "#8e6cf6", fontStep: 3, reduceMotion: true, evil: "<script>" }), {
  themeMode: "auto",
  accentColor: "#8E6CF6",
  fontStep: 3,
  reduceMotion: true,
});
assert.deepEqual(sanitizeAppearancePatch({ themeMode: "neon", accentColor: "#123456", fontStep: 9, reduceTransparency: "yes" }), {});
assert.deepEqual(sanitizeAppearancePatch(null), {});

// The cache keeps 2.x readers (boot script) right and drops the removed options.
const store = memStore({ descall_user_settings: JSON.stringify({ msgSounds: false, uiDensity: "compact", bubbleStyle: "classic" }) });
writeAppearance({ themeMode: "light", accentColor: "#30B05A", fontStep: 3 }, { updatedAt: "2026-10-26T10:00:00.000Z", storage: store });
const saved = JSON.parse(store.getItem("descall_user_settings"));
assert.equal(saved.msgSounds, false, "other settings survive");
assert.equal(saved.darkMode, false);
assert.equal(saved.accentColor, "#30B05A");
assert.equal(saved.chatFontSize, Math.round(14 * fontScale(3)));
assert.equal(saved.appearanceUpdatedAt, "2026-10-26T10:00:00.000Z");
assert.equal("uiDensity" in saved, false);
assert.equal("bubbleStyle" in saved, false);
assert.equal(store.getItem("descall_settings"), store.getItem("descall_user_settings"));
assert.equal(readAppearance(store).fontStep, 3);

// 2.x "Düşük performans modu" becomes Şeffaflığı azalt.
assert.equal(readAppearance(memStore({ "descall:glass-desktop-lite": "1" })).reduceTransparency, true);
assert.equal(readAppearance(memStore({ "descall:glass-desktop-lite": "0" })).reduceTransparency, false);

// Ctrl + / Ctrl − / Ctrl 0.
assert.equal(fontStepForShortcut({ ctrlKey: true, key: "=" }, 1), 2);
assert.equal(fontStepForShortcut({ metaKey: true, key: "+" }, 3), 3);
assert.equal(fontStepForShortcut({ ctrlKey: true, key: "-" }, 0), 0);
assert.equal(fontStepForShortcut({ ctrlKey: true, key: "-" }, 2), 1);
assert.equal(fontStepForShortcut({ ctrlKey: true, key: "0" }, 3), 1);
assert.equal(fontStepForShortcut({ key: "+" }, 1), null);
assert.equal(fontStepForShortcut({ ctrlKey: true, altKey: true, key: "+" }, 1), null);

// Removed from Görünüm: density, bubble style, status picker.
const pane = readFileSync(join(here, "../components/settings/AppearancePane.jsx"), "utf8");
const panel = readFileSync(join(here, "../components/layout/UserPanel.jsx"), "utf8");
assert.doesNotMatch(panel, /setUiDensity|setBubbleStyle|us-bubble-preview/);
assert.doesNotMatch(pane, /status-picker|onStatusChange/);
for (const copy of ["Mağaza temaları", "Şeffaflığı azalt", "Hareketi azalt", "CANLI ÖNİZLEME", "Ctrl + / Ctrl − ile de değişir."]) {
  assert.ok(pane.includes(copy), copy);
}
// iPhone's 15.5px chat pin follows the text size and the own bubble the accent.
const css = readFileSync(join(here, "../styles/settings-v3.css"), "utf8");
assert.match(css, /calc\(15\.5px \* var\(--ui-font-scale, 1\)\)/);
assert.match(css, /rgba\(var\(--g-brand-rgb, 88, 122, 246\), 0\.26\)/);
assert.match(readFileSync(join(here, "../styles.css"), "utf8"), /@import '\.\/styles\/settings-v3\.css';/);

console.log("appearancePrefs.selftest ok");
