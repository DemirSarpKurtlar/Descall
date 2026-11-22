// 2.11.8: the overlay payload carries the theme accent and only loadable avatars.
import assert from "node:assert/strict";
import fs from "node:fs";
import { overlayAvatarUrl, overlayShouldShow, readAppInFront, readOverlayBrandRgb } from "./useElectronOverlay.js";

assert.equal(overlayAvatarUrl({ avatarUrl: "https://x.supabase.co/a.png" }), "https://x.supabase.co/a.png");
assert.equal(overlayAvatarUrl({ avatarUrl: "/uploads/a.png" }), "", "relative URLs cannot load from file://");
assert.equal(overlayAvatarUrl({ avatarUrl: "javascript:alert(1)" }), "");
assert.equal(overlayAvatarUrl(null), "");

globalThis.getComputedStyle = () => ({ getPropertyValue: () => " 34,199,214 " });
assert.equal(readOverlayBrandRgb({ documentElement: {} }), "34,199,214");
globalThis.getComputedStyle = () => ({ getPropertyValue: () => "url(x)" });
assert.equal(readOverlayBrandRgb({ documentElement: {} }), "");

const src = fs.readFileSync(new URL("./useElectronOverlay.js", import.meta.url), "utf8");
for (const k of ["pending", "kind", "since", "avatarUrl", "brandRgb: readOverlayBrandRgb()", "lang: overlayLang()"]) {
  assert.ok(src.includes(k), `overlayShow payload carries ${k}`);
}
assert.match(src, /new MutationObserver\([\s\S]*?overlayUpdate\?\.\(\{ brandRgb: next \}\)/, "re-tints when the theme changes mid-call");
// Feedback 2026-11-22 (DemirBey, "kocaman arama işareti"): the always-on-top call card is a
// stand-in for when Descall is not in front; over Descall itself it covered the window
// buttons and the call screen's top-right controls.
assert.equal(overlayShouldShow({ active: true, appInFront: true }), false, "Descall in front: no card");
assert.equal(overlayShouldShow({ active: true, appInFront: false }), true, "Descall in the background: card");
assert.equal(overlayShouldShow({ active: true, appInFront: false, auxCovers: true }), false, "a Descall+ call window replaces it");
assert.equal(overlayShouldShow({ active: false, appInFront: false }), false);
assert.equal(readAppInFront({ visibilityState: "visible", hasFocus: () => true }), true);
assert.equal(readAppInFront({ visibilityState: "visible", hasFocus: () => false }), false, "another app has the focus");
assert.equal(readAppInFront({ visibilityState: "hidden", hasFocus: () => true }), false, "minimized / in the tray");
assert.equal(readAppInFront(null), false);
assert.match(src, /if \(!overlayShouldShow\(\{ active, auxCovers: auxCoversOverlay\(\), appInFront \}\)\) \{\s*window\.electronAPI\?\.overlayHide\?\.\(\);/, "the card is hidden while Descall is in front");
assert.match(src, /window\.addEventListener\("focus", sync\);[\s\S]*window\.addEventListener\("blur", sync\);[\s\S]*document\.addEventListener\("visibilitychange", sync\);/);
assert.match(src, /\[active, title, muted, deafened, applyDeafen, pending, kind, since, avatarUrl, auxState, appInFront\]/);
console.log("useElectronOverlay selftest ok");
