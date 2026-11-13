/**
 * Chat media box (no jump while photos / GIFs / videos load).
 * Run: node frontend/src/lib/mediaBox.selftest.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAX_RATIO,
  MEDIA_DEFAULTS,
  MIN_RATIO,
  computeMediaBox,
  createMediaDimsCache,
  mediaBoxStyle,
  mediaDimsKey,
  normalizeDims,
  readMediaDims,
} from "./mediaBox.js";

const here = dirname(fileURLToPath(import.meta.url));

// normalizeDims: both sides positive and finite, rounded.
assert.deepEqual(normalizeDims(640.4, "480"), { width: 640, height: 480 });
assert.equal(normalizeDims(0, 480), null);
assert.equal(normalizeDims(640, -1), null);
assert.equal(normalizeDims(Number.NaN, 10), null);
assert.equal(normalizeDims(undefined, undefined), null);

// readMediaDims: any spelling the message, attachment or embed may carry.
assert.deepEqual(readMediaDims({ width: 800, height: 600 }), { width: 800, height: 600 });
assert.deepEqual(readMediaDims({ mediaWidth: 356, mediaHeight: 200, width: 1, height: 1 }), { width: 356, height: 200 });
assert.deepEqual(readMediaDims({ media_width: "1080", media_height: "1920" }), { width: 1080, height: 1920 });
assert.deepEqual(readMediaDims({ url: "x", dimensions: { w: 300, h: 150 } }), { width: 300, height: 150 });
assert.deepEqual(readMediaDims({ mediaMeta: { width: 64, height: 64 } }), { width: 64, height: 64 });
assert.equal(readMediaDims({ url: "https://x/y.png" }), null);
assert.equal(readMediaDims(null), null);
assert.equal(readMediaDims("800x600"), null);

// computeMediaBox: a known size keeps its own shape.
assert.deepEqual(computeMediaBox({ dims: { width: 1600, height: 900 } }), { ratio: 1.7778, known: true });
assert.deepEqual(computeMediaBox({ dims: { width: 356, height: 200 }, kind: "gif" }), { ratio: 1.78, known: true });
assert.deepEqual(computeMediaBox({ dims: { width: 600, height: 900 } }), { ratio: 0.6667, known: true });

// Extreme shapes are clamped (the file is letterboxed inside the box).
assert.equal(computeMediaBox({ dims: { width: 100, height: 5000 } }).ratio, MIN_RATIO);
assert.equal(computeMediaBox({ dims: { width: 5000, height: 100 } }).ratio, MAX_RATIO);

// Unknown size: a default shape per kind, never "nothing".
for (const kind of ["image", "gif", "video", "embed"]) {
  assert.deepEqual(computeMediaBox({ kind }), { ratio: MEDIA_DEFAULTS[kind], known: false }, kind);
}
assert.deepEqual(computeMediaBox({ kind: "nope" }), { ratio: MEDIA_DEFAULTS.image, known: false });
assert.deepEqual(computeMediaBox({ dims: { width: 0, height: 10 }, kind: "video" }), { ratio: MEDIA_DEFAULTS.video, known: false });

// Inline custom property for .chat-media.
assert.deepEqual(mediaBoxStyle({ ratio: 1.78, known: true }), { "--media-ar": "1.78" });
assert.equal(mediaBoxStyle(null), undefined);

// Cache keys: signed query strings drop, inline URLs are not stored.
assert.equal(mediaDimsKey("https://cdn.example/m/a.jpg?token=1&exp=2"), "https://cdn.example/m/a.jpg");
assert.equal(mediaDimsKey("https://cdn.example/m/a.jpg#frag"), "https://cdn.example/m/a.jpg");
assert.equal(mediaDimsKey("data:image/png;base64,AAAA"), "");
assert.equal(mediaDimsKey("blob:https://x/1"), "");
assert.equal(mediaDimsKey(""), "");

// Cache: LRU, persisted once per batch, survives a reload, ignores junk.
const store = new Map();
const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
const queued = [];
const cache = createMediaDimsCache({ storage, max: 3, schedule: (fn) => queued.push(fn) });
assert.equal(cache.get("https://x/a.png"), null);
assert.equal(cache.set("https://x/a.png?sig=1", 640, 480), true);
assert.equal(cache.set("https://x/a.png?sig=2", 640, 480), false, "same file, same size: no write");
assert.deepEqual(cache.get("https://x/a.png?sig=9"), { width: 640, height: 480 });
assert.equal(cache.set("https://x/b.png", 0, 10), false);
assert.equal(cache.set("data:image/png;base64,AA", 10, 10), false);
cache.set("https://x/b.png", 10, 20);
cache.set("https://x/c.png", 30, 40);
cache.set("https://x/d.png", 50, 60);
assert.equal(cache.size(), 3);
assert.equal(cache.get("https://x/a.png"), null, "oldest entry falls out");
assert.equal(queued.length, 1, "one write for the whole batch");
queued.shift()();
const reloaded = createMediaDimsCache({ storage, max: 3 });
assert.deepEqual(reloaded.get("https://x/d.png"), { width: 50, height: 60 });
assert.deepEqual(reloaded.get("https://x/b.png"), { width: 10, height: 20 });
store.set("descall:mediaDims:v1", "{not json");
assert.equal(createMediaDimsCache({ storage }).get("https://x/d.png"), null);
store.set("descall:mediaDims:v1", JSON.stringify({ "https://x/e.png": [0, 1], "https://x/f.png": [3, 4] }));
const mixed = createMediaDimsCache({ storage });
assert.equal(mixed.get("https://x/e.png"), null);
assert.deepEqual(mixed.get("https://x/f.png"), { width: 3, height: 4 });
// No storage (private mode / SSR): memory only, never throws.
const mem = createMediaDimsCache({ storage: null, schedule: (fn) => fn() });
assert.equal(mem.set("https://x/g.png", 5, 6), true);
assert.deepEqual(mem.get("https://x/g.png"), { width: 5, height: 6 });

// Wiring: every chat media surface goes through the shared frame.
const read = (p) => readFileSync(join(here, p), "utf8");
const list = read("../components/chat/MessageList.jsx");
assert.ok(list.includes("<MessageMediaImage") && list.includes("<MessageMediaVideo"), "message photos/GIFs and videos use MessageMedia");
assert.ok(list.includes("dims={readMediaDims(message)}"), "message metadata sizes reach the box");
assert.ok(!list.includes("setImageLoaded"), "the old blur placeholder is gone");
assert.ok(read("../components/chat/LinkPreviewCard.jsx").includes("<MessageMediaImage"), "link preview picture");
const embed = read("../components/chat/SlashCommandEmbed.jsx");
assert.ok(embed.includes("readMediaDims(embed.image)"), "bot embed image reserves its box");
assert.ok(read("../components/chat/GiphyPicker.jsx").includes("rememberMediaDims(gifUrl"), "a sent GIF knows its size at once");
const media = read("../components/chat/MessageMedia.jsx");
assert.ok(media.includes("img.complete") && media.includes("useLayoutEffect"), "cached media settles before the first paint");
assert.ok(media.includes('loading="lazy"') && media.includes('decoding="async"'), "lazy, async decode");
assert.ok(media.includes('t("msg5.media.imageFailed")') && media.includes('t("msg5.media.videoFailed")'), "fallback text is translated");
assert.ok(media.includes("skeleton-line chat-media-skeleton"), "reuses the shared skeleton shimmer");
const lightbox = read("../components/chat/MessageMediaLightbox.jsx");
assert.ok(lightbox.includes("mv-skeleton") && lightbox.includes("el.complete"), "viewer shimmers until the full image decodes");

const css = read("../styles/messages.css");
assert.match(css, /\.chat-media\.is-boxed\s*\{[^}]*aspect-ratio:\s*var\(--media-ar/, "box height follows its width");
assert.match(css, /\.chat-media\.is-boxed\s*\{[^}]*max-height:\s*var\(--media-max-h\)/, "box keeps the existing max height");
assert.match(css, /\.chat-media\s*\{[^}]*--media-max-h:\s*min\(480px, 60vh\)/, "same cap as the old .message-image");
assert.match(css, /\.chat-media\s*\{[^}]*max-width:\s*100%/, "never wider than the bubble");
assert.match(css, /--media-fade:\s*200ms/, "fade is ~200ms");
assert.match(css, /prefers-reduced-motion: reduce\)\s*\{[^}]*--media-fade:\s*0ms/, "reduced motion: no fade");
assert.match(css, /\.message-group\.is-offscreen \.chat-media-skeleton\s*\{\s*animation-play-state:\s*paused/, "offscreen rows pause the shimmer");
const base = read("../styles/base.css");
assert.match(base, /prefers-reduced-motion: reduce\)\s*\{\s*\.skeleton,\s*\.skeleton-line\s*\{\s*animation:\s*none/, "shared shimmer stops under reduced motion");

for (const loc of ["en", "tr", "de", "es", "fr", "pt-BR", "ru"]) {
  const src = read(`../i18n/locales/msg5.${loc}.js`);
  assert.match(src, /media:\s*\{\s*imageFailed:\s*"[^"]+",\s*videoFailed:\s*"[^"]+"/, `msg5.media in ${loc}`);
}

console.log("mediaBox.selftest.mjs: ok");
