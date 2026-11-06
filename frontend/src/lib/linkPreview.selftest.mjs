// Selftest: link previews, client side (messaging phase 4).
//   node frontend/src/lib/linkPreview.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

globalThis.window = globalThis.window || { location: { origin: "https://descall.com", hostname: "descall.com" } };
const { previewUrlOf, fetchLinkPreview, sanitizePreview, cachedPreview, __resetLinkPreviewCache } = await import("./linkPreview.js");

// Which link a message previews.
assert.equal(previewUrlOf("Linki atıyorum: https://example.com/turnuva."), "https://example.com/turnuva");
assert.equal(previewUrlOf("ilk http://a.org/x sonra https://b.org/y"), "http://a.org/x");
assert.equal(previewUrlOf("https://example.com/a#bolum"), "https://example.com/a", "fragment dropped");
assert.equal(previewUrlOf("kod: `https://example.com/kod`"), null, "inline code is not previewed");
assert.equal(previewUrlOf("```\nhttps://example.com/blok\n```"), null, "code blocks are not previewed");
assert.equal(previewUrlOf("https://media.giphy.com/media/x/giphy.gif"), null, "GIF hosts are media");
assert.equal(previewUrlOf("https://descall.com/invite/abc123"), null, "Descall links keep their own embed");
assert.equal(previewUrlOf("https://example.com/photo.jpg"), null, "direct files are not pages");
assert.equal(previewUrlOf("www.example.com"), null, "only explicit http(s) links");
assert.equal(previewUrlOf("javascript:alert(1)"), null);
assert.equal(previewUrlOf(""), null);

// Only safe fields reach the card: raster data: images only, http(s) links only.
const clean = sanitizePreview({ url: "javascript:alert(1)", title: "T", description: "D", siteName: "S", image: "https://tracker.example/pixel.png" }, "https://example.com/a");
assert.equal(clean.url, "https://example.com/a");
assert.equal(clean.image, null, "a remote image URL would make the client contact the site");
assert.equal(sanitizePreview({ title: "T", image: "data:image/svg+xml;base64,PHN2Zy8+" }, "https://e.com/").image, null, "never svg");
assert.ok(sanitizePreview({ title: "T", image: "data:image/png;base64,iVBORw0K" }, "https://e.com/").image.startsWith("data:image/png"));
assert.equal(sanitizePreview({ title: "x".repeat(500) }, "https://e.com/").title.length, 200);

// One request per URL, cached, failures not cached (retry next time).
__resetLinkPreviewCache();
let calls = 0;
const ok = async (path) => { calls += 1; assert.ok(path.startsWith("/api/link-preview?url=https%3A%2F%2Fexample.com%2Fa")); return { ok: true, preview: { title: "Başlık", url: "https://example.com/a" } }; };
const [a, b] = await Promise.all([fetchLinkPreview("https://example.com/a", ok), fetchLinkPreview("https://example.com/a", ok)]);
assert.equal(a.title, "Başlık");
assert.equal(b, a);
assert.equal(calls, 1);
await fetchLinkPreview("https://example.com/a", ok);
assert.equal(calls, 1, "cached");
assert.equal(cachedPreview("https://example.com/a").title, "Başlık");
await fetchLinkPreview("https://example.com/none", async () => ({ ok: false, error: "no_meta" }));
assert.equal(cachedPreview("https://example.com/none"), null, "no preview is remembered as null");
await fetchLinkPreview("https://example.com/down", async () => { throw new Error("offline"); });
assert.equal(cachedPreview("https://example.com/down"), undefined, "a network error is retried later");

// Wiring: the card is lazy and only rendered for a previewable link; it never loads remote images.
const here = dirname(fileURLToPath(import.meta.url));
const list = readFileSync(join(here, "../components/chat/MessageList.jsx"), "utf8");
assert.ok(list.includes('const LinkPreviewCard = lazy(() => import("./LinkPreviewCard.jsx"));'));
assert.ok(/\{previewUrl \? \(\s*<Suspense fallback=\{null\}>\s*<LinkPreviewCard url=\{previewUrl\} \/>/.test(list));
const card = readFileSync(join(here, "../components/chat/LinkPreviewCard.jsx"), "utf8");
assert.ok(card.includes('rel="noopener noreferrer nofollow"'));
assert.ok(card.includes("src={preview.image}") && !/fetch\(/.test(card), "the card renders data from our API only");

console.log("linkPreview selftest OK");
