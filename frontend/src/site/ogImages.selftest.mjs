/**
 * Social preview images: one default per site language, the right image per page,
 * and every committed PNG is 1200x630 and small enough for link previews.
 * Run: node src/site/ogImages.selftest.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OG_DEFAULT_IMAGES, OG_DISCORD_IMAGE, defaultOgImage, ogImageFor } from "./ogImages.js";
import { SITE_LOCALES } from "./siteLocales.js";
import { buildArticleLd } from "./jsonLdBuilders.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

for (const loc of SITE_LOCALES) {
  assert.ok(OG_DEFAULT_IMAGES[loc], `default image for site locale ${loc}`);
}
assert.equal(defaultOgImage("en"), "/og-default.png");
assert.equal(defaultOgImage("tr"), "/og-default-tr.png");
assert.equal(defaultOgImage("pt-BR"), "/og-default-pt-br.png");
assert.equal(defaultOgImage("pt-br"), "/og-default-pt-br.png");
assert.equal(defaultOgImage("xx"), "/og-default.png", "unknown language -> English");

assert.equal(ogImageFor(undefined, "de"), "/og-default-de.png", "no image -> language default");
assert.equal(ogImageFor("/og-default.png", "ru"), "/og-default-ru.png");
assert.equal(ogImageFor("/og-features.png", "en"), "/og-features.png", "English page keeps its image");
assert.equal(ogImageFor("/og-features.png", "fr"), "/og-default-fr.png", "English words -> language default");
assert.equal(ogImageFor("/og-discord.png", "tr"), "/og-default-tr.png", "Turkish landings get the Turkish image");
assert.equal(ogImageFor("/og-discord.png", "en"), "/og-discord.png");

assert.deepEqual(buildArticleLd({ title: "t", path: "/tr/blog/x", inLanguage: "tr" }).image, ["https://descall.com/og-default-tr.png"]);
assert.deepEqual(buildArticleLd({ title: "t", path: "/blog/x", inLanguage: "en" }).image, ["https://descall.com/og-default.png"]);

for (const file of [...Object.values(OG_DEFAULT_IMAGES), OG_DISCORD_IMAGE]) {
  const buf = fs.readFileSync(path.join(root, "public", file));
  assert.equal(buf.subarray(1, 4).toString("latin1"), "PNG", `${file} is a PNG`);
  assert.equal(buf.readUInt32BE(16), 1200, `${file} width`);
  assert.equal(buf.readUInt32BE(20), 630, `${file} height`);
  assert.ok(buf.length <= 120 * 1024, `${file} is ${buf.length} bytes (max 120 KB)`);
}

console.log("ogImages.selftest: ok");
