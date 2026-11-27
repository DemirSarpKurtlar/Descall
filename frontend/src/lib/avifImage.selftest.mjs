// node src/lib/avifImage.selftest.mjs
// AVIF copies of user images on the client: URL contract with the backend, support
// detection (with its cached answer), preferAvif, and the fallbacks wired into Avatar and
// banner art.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AVIF_PROBE,
  AVIF_SUPPORT_KEY,
  _resetAvifSupportForTests,
  avifSiblingUrl,
  detectAvifSupport,
  isAvifSiblingUrl,
  isAvifSupported,
  preferAvif,
} from "./avifImage.js";
import { artUrl } from "./stillArt.js";

const here = dirname(fileURLToPath(import.meta.url));
const SB = "https://pubpfuoymdlgrdevedxk.supabase.co/storage/v1/object/public/media";

// ── URL contract (backend lib/imageVariants.js) ────────────────────────────
assert.equal(avifSiblingUrl(`${SB}/avatars/1763900000000-abc1234-av1.png`), `${SB}/avatars/1763900000000-abc1234-av1.avif`);
assert.equal(avifSiblingUrl(`${SB}/avatars/1763900000000-abc1234-av1.png?v=1763900001000`), `${SB}/avatars/1763900000000-abc1234-av1.avif?v=1763900001000`, "cache-buster kept");
assert.equal(avifSiblingUrl(`${SB}/banners/1763900000000-abc1234-av1.jpg`), `${SB}/banners/1763900000000-abc1234-av1.avif`);
assert.equal(avifSiblingUrl(`${SB}/images/1763900000000-abc1234-av1.webp`), `${SB}/images/1763900000000-abc1234-av1.avif`);
assert.equal(avifSiblingUrl(`${SB}/avatars/1763900000000-abc1234.png`), null, "older uploads have no AVIF");
assert.equal(avifSiblingUrl(`${SB}/avatars/1763900000000-abc1234-av1.gif`), null, "GIFs are never converted");
assert.equal(avifSiblingUrl(`${SB}/files/1763900000000-abc1234-av1.png`), null, "only avatars, banners, images");
assert.equal(avifSiblingUrl(`http://x.supabase.co/storage/v1/object/public/media/avatars/1763900000000-abc1234-av1.png`), null, "https only");
assert.equal(avifSiblingUrl("https://media.tenor.com/1763900000000-abc1234-av1.png"), null, "other hosts / paths untouched");
assert.equal(avifSiblingUrl("data:image/png;base64,AAAA"), null);
assert.equal(avifSiblingUrl(null), null);
assert.ok(isAvifSiblingUrl(`${SB}/avatars/1763900000000-abc1234-av1.avif?v=2`));
assert.ok(!isAvifSiblingUrl(`${SB}/avatars/1763900000000-abc1234-av1.png`));

// ── detection + preferAvif ─────────────────────────────────────────────────
function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}
function fakeImage(outcome) {
  return class {
    set src(v) {
      this._src = v;
      setTimeout(() => {
        if (outcome === "load") {
          this.width = 1;
          this.height = 1;
          this.onload?.();
        } else if (outcome === "error") this.onerror?.();
      }, 1);
    }
  };
}
const marked = `${SB}/avatars/1763900000000-abc1234-av1.png?v=9`;

_resetAvifSupportForTests();
let store = memoryStorage();
assert.equal(await detectAvifSupport({ ImageCtor: fakeImage("load"), storage: store }), true, "decodes the probe");
assert.equal(store._m.get(AVIF_SUPPORT_KEY), "1", "answer cached for the next start");
assert.equal(isAvifSupported(), true);
assert.equal(preferAvif(marked), `${SB}/avatars/1763900000000-abc1234-av1.avif?v=9`);
assert.equal(preferAvif(`${SB}/avatars/1763900000000-abc1234.png`), `${SB}/avatars/1763900000000-abc1234.png`, "unmarked: original");
assert.equal(preferAvif(null), null);

_resetAvifSupportForTests();
store = memoryStorage();
assert.equal(await detectAvifSupport({ ImageCtor: fakeImage("error"), storage: store }), false, "iOS 15 / old WebView");
assert.equal(store._m.get(AVIF_SUPPORT_KEY), "0");
assert.equal(preferAvif(marked), marked, "no AVIF support: original");

_resetAvifSupportForTests();
assert.equal(await detectAvifSupport({ ImageCtor: fakeImage("never"), storage: memoryStorage(), timeoutMs: 20 }), false, "a decoder that never answers counts as no");

_resetAvifSupportForTests();
store = memoryStorage({ [AVIF_SUPPORT_KEY]: "1" });
const pending = detectAvifSupport({ ImageCtor: fakeImage("error"), storage: store });
assert.equal(isAvifSupported(), true, "previous start's answer is used while the probe decodes");
await pending;
assert.equal(isAvifSupported(), false, "and replaced by this start's result");

_resetAvifSupportForTests();
assert.equal(await detectAvifSupport({ ImageCtor: null, storage: null }), false, "no Image (node / worker): no");
assert.ok(AVIF_PROBE.startsWith("data:image/avif;base64,AAAAHGZ0eXBhdmlm"), "probe is an AVIF (ftyp avif)");

// ── banner art goes through preferAvif ────────────────────────────────────
_resetAvifSupportForTests(true);
assert.equal(artUrl(marked), `${SB}/avatars/1763900000000-abc1234-av1.avif?v=9`, "artUrl prefers the AVIF copy");
assert.equal(artUrl("data:image/svg+xml,%3Csvg%2F%3E"), "data:image/svg+xml,%3Csvg%2F%3E", "shop art untouched");
_resetAvifSupportForTests(false);
assert.equal(artUrl(marked), marked);
_resetAvifSupportForTests();

// ── Avatar falls back to the original when the AVIF copy fails ────────────
const avatar = readFileSync(join(here, "..", "components", "ui", "Avatar.jsx"), "utf8");
assert.match(avatar, /from "\.\.\/\.\.\/lib\/avifImage\.js"/, "Avatar uses the AVIF helper");
assert.match(avatar, /!animated && !avifFailed && originalUrl \? preferAvif\(originalUrl\)/, "animated GIF avatars never switch to AVIF");
assert.match(avatar, /if \(usingAvif && displaySrc === activeUrl\) \{\s*\/\/[^\n]*\n\s*setAvifFailed\(true\);/, "onError retries the original before giving up");
assert.match(avatar, /setAvifFailed\(false\);\s*setStaticFrame\(null\);\s*\}, \[resolvedUrl\]\)/, "a new URL tries AVIF again");

console.log("avifImage selftest OK");
