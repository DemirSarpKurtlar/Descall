// node src/site/avifPictures.selftest.mjs
// AVIF product shots on the public site: every AVIF copy exists, is a real AVIF and is
// smaller than its WebP; every <picture> that offers AVIF keeps a WebP <img> fallback (iOS 15,
// old Android WebViews, crawlers); no <img src> points at an AVIF; the LCP preload is the
// typed AVIF one only.
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = join(here, "..", "..");
const pub = join(frontend, "public");
const read = (rel) => readFileSync(join(frontend, rel), "utf8");

const { listSources, avifPathFor } = await import(pathToFileURL(join(frontend, "scripts/make-avif.mjs")).href);
const { previewAvifSrcset, previewSrcset, avifSrc } = await import("./seo/featureGroups.js");

// 1. Every product shot has a smaller, real AVIF next to it.
const sources = listSources(pub);
assert.ok(sources.length >= 10, "product shots found");
let webpBytes = 0;
let avifBytes = 0;
for (const src of sources) {
  const avif = avifPathFor(src);
  assert.ok(existsSync(avif), `AVIF copy for ${src} (run scripts/make-avif.mjs)`);
  const head = readFileSync(avif).subarray(4, 12).toString("ascii");
  assert.equal(head, "ftypavif", `${avif} is an AVIF file`);
  assert.ok(statSync(avif).size < statSync(src).size, `${avif} is smaller than its source`);
  webpBytes += statSync(src).size;
  avifBytes += statSync(avif).size;
}

// 2. srcset helpers keep widths and only swap the extension.
assert.equal(avifSrc("/brand/previews/02-dm.webp"), "/brand/previews/02-dm.avif");
assert.equal(
  previewAvifSrcset("/brand/previews/02-dm.webp"),
  previewSrcset("/brand/previews/02-dm.webp").replace(/\.webp/g, ".avif"),
);
for (const cand of previewAvifSrcset("/brand/previews/06-server.webp").split(", ")) {
  const [file, w] = cand.split(" ");
  assert.match(w, /^\d+w$/);
  assert.ok(existsSync(join(pub, file)), `${file} exists`);
}

// 3. Rendered prerender markup: AVIF only as a typed <source>, always with a WebP <img>.
const { registerSiteCatalogs } = await import(pathToFileURL(join(frontend, "scripts/siteCatalogs.mjs")).href);
await registerSiteCatalogs();
const { corePageBody } = await import("./seo/corePageBodies.js");
const { lcpImagePreload } = await import(pathToFileURL(join(frontend, "scripts/prerender-seo.mjs")).href);

function checkPictures(html, where) {
  const pictures = html.match(/<picture>[\s\S]*?<\/picture>/g) || [];
  let withAvif = 0;
  for (const pic of pictures) {
    const sources = pic.match(/<source [^>]*>/g) || [];
    const img = pic.match(/<img [^>]*>/);
    assert.ok(img, `${where}: <picture> has an <img> fallback`);
    assert.doesNotMatch(img[0], /\bsrc="[^"]*\.avif"/, `${where}: <img src> is never AVIF`);
    assert.doesNotMatch(img[0], /\bsrcset="[^"]*\.avif/, `${where}: <img srcset> is never AVIF`);
    for (const s of sources) {
      const set = (s.match(/srcset="([^"]+)"/) || [])[1] || "";
      if (/\.avif/.test(set)) {
        withAvif += 1;
        assert.match(s, /type="image\/avif"/, `${where}: AVIF source is typed`);
        for (const cand of set.split(",").map((c) => c.trim().split(" ")[0])) assert.ok(existsSync(join(pub, cand)), `${where}: ${cand} exists`);
      }
    }
    if (sources.some((s) => /type="image\/avif"/.test(s))) {
      // The WebP twin of each AVIF candidate is what the fallback loads.
      assert.match(img[0], /\bsrc="[^"]+\.webp"/, `${where}: fallback is the WebP`);
    }
  }
  return withAvif;
}
const home = corePageBody("/");
assert.ok(checkPictures(home, "home hero") >= 2, "home hero offers AVIF for phone and desktop");
assert.ok(home.indexOf('type="image/avif" srcset="/brand/previews/hero-ios-chats-480.avif') < home.indexOf('srcset="/brand/previews/hero-ios-chats-480.webp'), "phone AVIF source comes before the phone WebP source");
const features = corePageBody("/features");
assert.ok(checkPictures(features, "/features") >= 1, "/features shots offer AVIF");
for (const body of [home, features]) {
  const preload = lcpImagePreload(body);
  assert.match(preload, /type="image\/avif"/, "LCP preload is typed AVIF");
  assert.doesNotMatch(preload, /\.webp/, "no WebP preload (AVIF browsers would download both)");
}

// 4. Source files: React components and string templates list AVIF first, WebP img after.
for (const rel of ["src/site/components/ProductFrame.jsx", "src/site/components/SeoProductPreview.jsx", "src/site/seo/pageTwins.js", "src/site/seo/landingTwins.js", "src/site/seo/corePageBodies.js"]) {
  const src = read(rel);
  const avifAt = src.search(/type="image\/avif"/);
  assert.ok(avifAt >= 0, `${rel} offers AVIF`);
  assert.ok(src.indexOf("<img", avifAt) > avifAt, `${rel}: the <img> fallback follows the AVIF source`);
  assert.doesNotMatch(src, /<img[^>]*src=\{?[`"][^`"]*\.avif/, `${rel}: no <img> points at an AVIF`);
}

console.log(`avifPictures selftest OK (${sources.length} shots, ${webpBytes} -> ${avifBytes} bytes)`);
