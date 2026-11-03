// Run: node src/lib/profileMediaPicker.selftest.mjs
// Profile photo + banner picker: helpers, locale keys, frost/portal wiring.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as m from "./profileMediaPicker.js";

const here = (p) => new URL(p, import.meta.url);
const src = (p) => readFileSync(here(p), "utf8");

// Targets keep the old crop shapes.
assert.equal(m.pickerTarget("avatar").aspect, 1);
assert.equal(m.pickerTarget("banner").aspect, 3);
assert.equal(m.pickerTarget("nope").id, "avatar");

// File validation mirrors the server limits.
assert.equal(m.validatePickedFile(null), "amp.errNoFile");
assert.equal(m.validatePickedFile({ type: "image/bmp", size: 10 }), "amp.errType");
assert.equal(m.validatePickedFile({ type: "image/gif", size: 9 * 1024 * 1024 }), "amp.errSize");
assert.equal(m.validatePickedFile({ type: "image/png", size: 1000 }), null);
assert.ok(m.isGifFile({ type: "IMAGE/GIF" }));

// Rotation + zoom.
assert.equal(m.rotateLeft(0), 270);
assert.equal(m.rotateLeft(90), 0);
assert.equal(m.normalizeRotation(-450), 270);
assert.equal(m.clampZoom(9), m.ZOOM_MAX);
assert.equal(m.clampZoom("x"), m.ZOOM_MIN);
assert.equal(m.zoomFillPercent(2), 50);

// GIF crop payload the backend accepts.
assert.deepEqual(m.serverCropPayload({ x: -1.2, y: 3.6, width: 99.5, height: 0 }, 450), { x: 0, y: 4, width: 100, height: 1, rotation: 90 });
assert.equal(m.serverCropPayload(null, 0), null);

// Preview layout: full area = identity, quarter turn swaps the media box.
const full = m.previewLayout({ x: 0, y: 0, width: 100, height: 100 }, 0, { width: 400, height: 200 });
assert.equal(full.wrap.width, "100%");
assert.equal(full.wrap.left, "0%");
const q = m.previewLayout({ x: 0, y: 0, width: 100, height: 100 }, 90, { width: 400, height: 200 });
assert.equal(q.media.width, "200%");
assert.match(q.media.transform, /rotate\(90deg\)/);

// GIPHY parsing skips broken rows.
const tiles = m.giphyTiles({ data: [{ id: "a", images: { fixed_width: { url: "p", width: "200", height: "100" }, downsized: { url: "f" } } }, { id: "b", images: {} }] });
assert.equal(tiles.length, 1);
assert.equal(tiles[0].full, "f");
assert.equal(tiles[0].ratio, 0.6);

// Handoff link + query.
assert.equal(m.handoffUrl("banner"), "https://descall.com/settings/profile?picker=banner");
assert.equal(m.readPickerQuery("?picker=banner"), "banner");
assert.equal(m.readPickerQuery("?picker=evil"), null);
assert.equal(m.readPickerQuery(""), null);

// Recent list in a fake storage, capped and de-duplicated.
const mem = new Map();
const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
for (let i = 0; i < 12; i++) m.pushRecent("avatar", { id: `g${i}`, preview: `https://x/p${i}`, full: `https://x/f${i}` }, store);
m.pushRecent("avatar", { id: "g3", preview: "https://x/p3", full: "https://x/f3" }, store);
m.pushRecent("avatar", { id: "bad", preview: "javascript:x", full: "http://x" }, store);
const rec = m.readRecent("avatar", store);
assert.ok(rec.length <= 8);
assert.equal(rec[0].id, "g3");
assert.ok(!rec.some((r) => r.id === "bad"), "non-https dropped");
assert.equal(new Set(rec.map((r) => r.id)).size, rec.length);
assert.deepEqual(m.readRecent("banner", store), []);
assert.equal(m.prevStep("final"), "edit");

// Every amp.* key the picker uses exists in all 7 locales.
const used = new Set();
for (const f of ["../components/profile/ProfileMediaPicker.jsx", "./profileMediaPicker.js"]) {
  for (const k of src(f).matchAll(/["(]amp\.([A-Za-z]+)"/g)) used.add(k[1]);
}
for (const l of m.GIF_CHIPS) used.add(l.label.slice(4));
assert.ok(used.size > 50, `found ${used.size} keys`);
for (const loc of ["en", "tr", "de", "es", "fr", "pt-BR", "ru"]) {
  const mod = await import(`../i18n/locales/profileMediaPicker.${loc}.js`);
  const cat = Object.values(mod)[0];
  for (const k of used) assert.ok(typeof cat[k] === "string" && cat[k].length, `${loc} missing amp.${k}`);
  assert.match(src(`../i18n/locales/${loc}.js`), /amp:? ?"?:? ?AMP_|"amp": AMP_/);
}
// Turkish copy uses "sen".
const { AMP_TR } = await import("../i18n/locales/profileMediaPicker.tr.js");
assert.equal(AMP_TR.fromComputer, "Bilgisayarından yükle");
assert.ok(!/\b(Lütfen|yükleyiniz|seçiniz)\b/.test(Object.values(AMP_TR).join(" ")));

// Heavy frost, opaque fallbacks, portal, no emoji.
const frost = src("../styles/frost.css");
assert.ok((frost.match(/\.amp-sheet/g) || []).length >= 4, "amp-sheet in every frost list");
const overlay = src("../styles/overlay.css");
assert.ok(overlay.includes(".amp-scrim"));
const css = src("../styles/profile-media-picker.css");
assert.match(css, /prefers-reduced-transparency/);
assert.match(css, /a11y-solid/);
// The 44pt ::after hit area must stay inside its button (it once covered the whole sheet on iOS).
assert.match(css, /\.amp-round \{\s*position: relative;/);
const jsx = src("../components/profile/ProfileMediaPicker.jsx");
assert.match(jsx, /OverlayPortal|createPortal/);
assert.ok(!/\p{Extended_Pictographic}/u.test(jsx), "no emoji in picker UI");
// UserPanel opens the picker and keeps the shop-banner rule.
const up = src("../components/layout/UserPanel.jsx");
assert.match(up, /<ProfileMediaPicker/);
assert.match(up, /uploadBannerImage\(file, crop\)[\s\S]{0,600}equipShopItem\("banner", null\)/);

// Universal link from the QR keeps only the whitelisted picker value.
const { resolveDeepLink } = await import("./deepLinks.js");
assert.equal(resolveDeepLink(m.handoffUrl("banner")).path, "/settings/profile?picker=banner");
assert.equal(resolveDeepLink("https://descall.com/settings/profile?picker=x").path, "/settings/profile");
assert.equal(resolveDeepLink("https://descall.com/friends?picker=avatar").path, "/friends");

console.log("profileMediaPicker selftest ok");
