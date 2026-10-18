// 2.11.8: the overlay payload carries the theme accent and only loadable avatars.
import assert from "node:assert/strict";
import fs from "node:fs";
import { overlayAvatarUrl, readOverlayBrandRgb } from "./useElectronOverlay.js";

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
console.log("useElectronOverlay selftest ok");
