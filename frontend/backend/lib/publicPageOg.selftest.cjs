"use strict";

/**
 * lib/publicPageOg.js: 1200x630 PNG cards (server, group, invalid) drawn with the bundled
 * fonts, the image host allow-list, remote fetch fallbacks and the LRU cache.
 * No network: fetch is a stub. Run: node frontend/backend/lib/publicPageOg.selftest.cjs
 */

const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const og = require("./publicPageOg");

(async () => {
  for (const f of ["InterDisplay-ExtraBold.otf", "Inter-Medium.otf", "LICENSE.txt"]) {
    assert.ok(fs.existsSync(path.join(__dirname, "..", "assets", "fonts", f)), `${f} bundled`);
  }

  // Host allow-list: our storage only, https only, no credentials / ports.
  assert.ok(og.isAllowedImageUrl("https://abc.supabase.co/storage/v1/object/public/servers/i.png"));
  assert.ok(og.isAllowedImageUrl("https://des-call.onrender.com/media/x.png"));
  assert.ok(!og.isAllowedImageUrl("http://abc.supabase.co/x.png"), "no http");
  assert.ok(!og.isAllowedImageUrl("https://169.254.169.254/latest"), "no metadata IPs");
  assert.ok(!og.isAllowedImageUrl("https://evil.example/x.png"), "no foreign hosts");
  assert.ok(!og.isAllowedImageUrl("https://user:pw@abc.supabase.co/x.png"));
  assert.ok(!og.isAllowedImageUrl("https://abc.supabase.co:8443/x.png"));
  let fetched = 0;
  const neverFetch = async () => {
    fetched += 1;
    throw new Error("network");
  };
  assert.equal(await og.fetchImage("https://evil.example/x.png", neverFetch), null);
  assert.equal(fetched, 0, "a foreign URL is never requested");
  assert.equal(await og.fetchImage("https://abc.supabase.co/x.png", neverFetch), null, "network error: null");
  const big = async () => ({ ok: true, headers: { get: () => String(50 * 1024 * 1024) }, arrayBuffer: async () => new ArrayBuffer(8) });
  assert.equal(await og.fetchImage("https://abc.supabase.co/x.png", big), null, "too large: null");
  const notImage = async () => ({ ok: true, headers: { get: () => "10" }, arrayBuffer: async () => Buffer.from("<html>") });
  assert.equal(await og.fetchImage("https://abc.supabase.co/x.png", notImage), null, "not an image: null");

  // A real (tiny) banner and icon come through.
  const red = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#aa2233" } }).png().toBuffer();
  const okFetch = async () => ({ ok: true, headers: { get: () => String(red.length) }, arrayBuffer: async () => red.buffer.slice(red.byteOffset, red.byteOffset + red.length) });
  const srv = await og.renderServerCard(
    { name: "Anadolu Craft \u{1F3AE} İşçi", description: "Sakin survival, haftalık yapı yarışmaları ve Sezon 7.", iconUrl: "https://abc.supabase.co/i.png", bannerUrl: "https://abc.supabase.co/b.png", memberCount: 4812, onlineCount: 637, category: "gaming-minecraft", lang: "tr", urlText: "descall.com/s/anadolucraft" },
    { fetchImpl: okFetch }
  );
  let meta = await sharp(srv).metadata();
  assert.equal(meta.format, "png");
  assert.equal(meta.width, 1200);
  assert.equal(meta.height, 630);
  const px = await sharp(srv).extract({ left: 1150, top: 20, width: 1, height: 1 }).raw().toBuffer();
  assert.ok(px[0] > px[2], "banner shows through on the right");

  // No images, very long name, every language.
  for (const lang of ["tr", "en", "de", "es", "fr", "pt-BR", "ru"]) {
    const buf = await og.renderServerCard({ name: "N".repeat(90), description: "", memberCount: 3, onlineCount: 0, lang }, { fetchImpl: neverFetch });
    meta = await sharp(buf).metadata();
    assert.equal(`${meta.width}x${meta.height}`, "1200x630", `${lang} server card size`);
  }
  const grp = await og.renderGroupCard({ name: "Hafta Sonu Ekibi", memberCount: 8, onlineCount: 3, inviterName: "Ece", avatars: [{ name: "Ece" }, { name: "Kaan" }], lang: "tr" }, { fetchImpl: neverFetch });
  meta = await sharp(grp).metadata();
  assert.equal(`${meta.width}x${meta.height}`, "1200x630");
  const bad = await og.renderInvalidCard({ lang: "ru" });
  meta = await sharp(bad).metadata();
  assert.equal(`${meta.width}x${meta.height}`, "1200x630");

  // Text helpers.
  assert.equal(og.plain("a\u202eb \u{1F3AE} c", 50), "a b c");
  assert.equal(og.plain("x".repeat(30), 10).length, 10);
  assert.equal(og.initialOf("  ışık"), "I");
  assert.equal(og.initialOf("\u{1F3AE}"), "D");

  // LRU cache: one build per key, in-flight de-duplicated, bounded.
  let builds = 0;
  const cache = og.createImageCache({ max: 2 });
  const build = async () => {
    builds += 1;
    return Buffer.from("x");
  };
  await Promise.all([cache.get("a", build), cache.get("a", build)]);
  assert.equal(builds, 1);
  await cache.get("b", build);
  await cache.get("c", build);
  assert.equal(cache.size(), 2);
  await cache.get("a", build);
  assert.equal(builds, 4, "evicted entry is rebuilt");

  console.log("publicPageOg selftest ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
