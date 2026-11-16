// node src/lib/stillArt.selftest.mjs
// Still art for reduced motion: SMIL is stripped from inline SVGs and from the server copy, and
// every Market 2.0 catalog SVG has a still copy with no animation left and the same shapes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { stripSmil, stillArtUrl, wantsStillArt } from "./stillArt.js";

const require = createRequire(import.meta.url);
const server = require("../../backend/lib/svgStill.js");
const { collectItems } = require("../../backend/catalog/shop2/seed.js");

const svg = "<svg xmlns='http://www.w3.org/2000/svg'><g><circle r='4'/><animate attributeName='opacity' values='0;1' dur='2s' repeatCount='3'/></g><g><animateTransform attributeName='transform' type='rotate' from='0 1 1' to='360 1 1' dur='9s' repeatCount='2'/></g><set attributeName='x' to='1'></set></svg>";
assert.equal(stripSmil(svg), "<svg xmlns='http://www.w3.org/2000/svg'><g><circle r='4'/></g><g></g></svg>");
assert.equal(server.stripSmil(svg), stripSmil(svg), "client and server strip the same way");

const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const still = stillArtUrl(dataUrl);
assert.ok(still.startsWith("data:image/svg+xml;charset=utf-8,"));
assert.ok(!/animate|%3Cset/i.test(decodeURIComponent(still.slice(still.indexOf(",") + 1))));
const plain = `data:image/svg+xml;charset=utf-8,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg'><rect/></svg>")}`;
assert.equal(stillArtUrl(plain), plain, "a still SVG is passed through");
assert.equal(stillArtUrl("https://des-call.onrender.com/api/shop/assets/abc?v=1"), "https://des-call.onrender.com/api/shop/assets/abc?v=1&still=1");
assert.equal(stillArtUrl("/api/shop2/assets/abc"), "/api/shop2/assets/abc?still=1");
assert.equal(stillArtUrl("https://example.com/a.png"), "https://example.com/a.png");
assert.equal(stillArtUrl(null), null);

const doc = (cls) => ({ documentElement: { classList: { contains: (c) => cls.includes(c) } } });
const win = (reduce) => ({ matchMedia: () => ({ matches: reduce }) });
assert.equal(wantsStillArt(doc([]), win(false)), false);
assert.equal(wantsStillArt(doc([]), win(true)), true);
assert.equal(wantsStillArt(doc(["reduce-motion"]), win(false)), true);
assert.equal(wantsStillArt(doc(["gd-lite"]), win(false)), true);

const img = server.stillImage({ contentType: "image/svg+xml", body: Buffer.from(svg), version: "v1" }, true);
assert.equal(img.version, "v1");
assert.ok(!/animate/.test(img.body.toString()));
assert.equal(server.stillImage({ contentType: "image/png", body: Buffer.from("x"), version: "v" }, true).body.toString(), "x");

let animated = 0;
for (const it of collectItems().items) {
  if (!it.asset_url || !/^data:image\/svg\+xml/.test(it.asset_url)) continue;
  const src = decodeURIComponent(it.asset_url.slice(it.asset_url.indexOf(",") + 1));
  const out = server.stripSmil(src);
  assert.ok(!/<(animate|set)\b/i.test(out), `${it.sku}: animation left in the still copy`);
  // Same drawing: only animation elements go.
  const shapes = (s) => (s.match(/<(path|circle|rect|ellipse|polygon|line|g|use|text)\b/g) || []).length;
  assert.equal(shapes(out), shapes(src), `${it.sku}: still copy lost shapes`);
  if (out !== src) animated += 1;
}
assert.ok(animated > 0);
console.log(`[stillArt] ok (${animated} animated catalog SVGs have a still copy)`);
