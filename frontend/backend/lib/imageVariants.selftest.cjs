"use strict";
// node lib/imageVariants.selftest.cjs
// AVIF variants: naming contract, Accept negotiation, animation sniffing, the one-at-a-time
// encoder (fake sharp), and a real encode when sharp is installed (CI installs it).
const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const iv = require("./imageVariants");

function png(width, height, { alpha = true, apng = false } = {}) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  const bpp = alpha ? 4 : 3;
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * bpp);
    for (let x = 0; x < width; x++) {
      const o = 1 + x * bpp;
      row[o] = (x * 7 + y * 3) & 255;
      row[o + 1] = (x * y) & 255;
      row[o + 2] = 0x58 + ((x + y) & 63);
      if (alpha) row[o + 3] = x < width / 2 ? 255 : 96;
    }
    rows.push(row);
  }
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr)];
  if (apng) parts.push(chunk("acTL", Buffer.from([0, 0, 0, 2, 0, 0, 0, 0])));
  parts.push(chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(parts);
}

function webpHeader({ animated }) {
  const b = Buffer.alloc(40);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(32, 4);
  b.write("WEBP", 8, "ascii");
  b.write("VP8X", 12, "ascii");
  b.writeUInt32LE(10, 16);
  b[20] = animated ? 0x02 | 0x10 : 0x10;
  return b;
}

(async () => {
  // ── naming contract ──────────────────────────────────────────────────────
  const name = iv.uploadName("png", { avif: true, now: 1763900000000, rand: "abc1234" });
  assert.equal(name, "1763900000000-abc1234-av1.png");
  assert.equal(iv.uploadName("jpg", { now: 1763900000000, rand: "abc1234" }), "1763900000000-abc1234.jpg", "unmarked name unchanged");
  assert.equal(iv.uploadName("png", { avif: true, now: 1, rand: "../X y" }), "1-xy-av1.png", "random part sanitised");
  assert.equal(iv.avifSiblingPath(`avatars/${name}`), "avatars/1763900000000-abc1234-av1.avif");
  assert.equal(iv.avifSiblingPath("images/1763900000000-abc1234-av1.jpeg"), "images/1763900000000-abc1234-av1.avif");
  assert.equal(iv.avifSiblingPath("quarantine/images/1763900000000-abc1234-av1.webp"), "quarantine/images/1763900000000-abc1234-av1.avif");
  assert.equal(iv.avifSiblingPath("images/1763900000000-abc1234.png"), null, "unmarked: no sibling");
  assert.equal(iv.avifSiblingPath("images/1763900000000-abc1234-av1.gif"), null, "GIF never has a sibling");
  assert.equal(iv.avifSiblingPath("images/../1763900000000-abc1234-av1.png"), null, "no traversal");
  assert.equal(iv.avifSiblingPath("images/1763900000000-abc1234-av1.avif"), null, "a sibling has no sibling");
  assert.ok(iv.isSiblingPath("images/1763900000000-abc1234-av1.avif"));
  assert.deepEqual(
    iv.withVariantPaths(["images/1763900000000-abc1234-av1.png", "files/1-a.pdf", "images/1763900000000-abc1234-av1.png"]),
    ["images/1763900000000-abc1234-av1.png", "images/1763900000000-abc1234-av1.avif", "files/1-a.pdf"],
  );
  assert.deepEqual(iv.withVariantPaths(null), []);

  // ── Accept negotiation ───────────────────────────────────────────────────
  const CHROME_IMG = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";
  const CHROME_NAV = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8";
  const SAFARI_15 = "image/webp,image/png,image/svg+xml,image/*;q=0.8,video/*;q=0.8,*/*;q=0.5";
  const SAFARI_17 = "image/webp,image/avif,image/jxl,image/heic,image/heic-sequence,video/*;q=0.8,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5";
  assert.equal(iv.acceptsAvif({ accept: CHROME_IMG, "sec-fetch-dest": "image" }), true, "Chromium <img>");
  assert.equal(iv.acceptsAvif({ accept: CHROME_IMG }), true, "no Sec-Fetch-Dest (older WebKit)");
  assert.equal(iv.acceptsAvif({ accept: SAFARI_17, "sec-fetch-dest": "image" }), true, "Safari 17 <img>");
  assert.equal(iv.acceptsAvif({ accept: SAFARI_15 }), false, "iOS 15 Safari: original");
  assert.equal(iv.acceptsAvif({ accept: CHROME_NAV, "sec-fetch-dest": "document" }), false, "open in new tab: original");
  assert.equal(iv.acceptsAvif({ accept: CHROME_NAV }), false, "navigation Accept without fetch metadata: original");
  assert.equal(iv.acceptsAvif({ accept: "*/*", "sec-fetch-dest": "empty" }), false, "fetch() download: original");
  assert.equal(iv.acceptsAvif({ accept: CHROME_IMG, "sec-fetch-dest": "empty" }), false, "only image loads are negotiated");
  assert.equal(iv.acceptsAvif({ accept: "image/avif;q=0,image/*" }), false, "q=0 refuses AVIF");
  assert.equal(iv.acceptsAvif({ accept: "image/avif;q=0.5" }), true);
  assert.equal(iv.acceptsAvif({ Accept: CHROME_IMG }), true, "header name case");
  assert.equal(iv.acceptsAvif({ accept: [CHROME_IMG] }), true, "array header");
  assert.equal(iv.acceptsAvif({}), false);
  assert.equal(iv.acceptsAvif(), false);

  // ── eligibility / animation ──────────────────────────────────────────────
  const still = png(48, 32);
  assert.equal(iv.sniffImageType(still), "image/png");
  assert.equal(iv.isAvifEligible({ buffer: still, mimetype: "image/png" }), true, "still PNG");
  assert.equal(iv.isAvifEligible({ buffer: png(8, 8, { apng: true }), mimetype: "image/png" }), false, "APNG is animated");
  assert.equal(iv.isApng(png(8, 8, { apng: true })), true);
  assert.equal(iv.isAvifEligible({ buffer: still, mimetype: "image/jpeg" }), false, "declared type must match the bytes");
  assert.equal(iv.isAvifEligible({ buffer: Buffer.from("GIF89a......"), mimetype: "image/gif" }), false, "GIF never");
  assert.equal(iv.isAvifEligible({ buffer: Buffer.from("x"), mimetype: "image/png" }), false, "not an image");
  assert.equal(iv.isAvifEligible({ buffer: Buffer.alloc(0), mimetype: "image/png" }), false);
  assert.equal(iv.isAnimatedWebp(webpHeader({ animated: true })), true);
  assert.equal(iv.isAnimatedWebp(webpHeader({ animated: false })), false);
  assert.equal(iv.isAvifEligible({ buffer: webpHeader({ animated: true }), mimetype: "image/webp" }), false, "animated WebP");
  assert.equal(iv.isAvifEligible({ buffer: webpHeader({ animated: false }), mimetype: "image/webp" }), true, "still WebP");
  const jpegHead = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
  assert.equal(iv.sniffImageType(jpegHead), "image/jpeg");
  assert.equal(iv.extForMime("image/jpeg"), "jpg");
  assert.equal(iv.extForMime("image/gif"), null);

  // ── encoder with a fake sharp ────────────────────────────────────────────
  const calls = [];
  function fakeSharp({ out = Buffer.alloc(10, 1), pages = 1, delayMs = 0, fail = false } = {}) {
    return (input, opts) => {
      const chain = {
        metadata: async () => ({ pages, width: 48, height: 32 }),
        rotate() { return chain; },
        resize(r) { calls.push({ resize: r, opts }); return chain; },
        avif(a) { calls.push({ avif: a }); return chain; },
        timeout() { return chain; },
        async toBuffer() {
          if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
          if (fail) throw new Error("boom");
          return { data: out, info: { width: 48, height: 32 } };
        },
      };
      return chain;
    };
  }
  const notBusy = () => false;
  iv._resetForTests();
  const big = Buffer.alloc(1000, 7);
  let r = await iv.encodeAvif(big, { profile: "avatar", sharp: fakeSharp(), isBusy: notBusy });
  assert.ok(r && r.buffer.length === 10 && r.mimeType === "image/avif", "encodes");
  assert.deepEqual(calls.find((c) => c.resize).resize, { width: 512, height: 512, fit: "inside", withoutEnlargement: true }, "avatar capped at 512 px");
  assert.equal(calls.find((c) => c.resize).opts.limitInputPixels, 40_000_000, "pixel bomb limit");
  assert.equal(calls.find((c) => c.avif).avif.effort, 2, "fast effort");
  assert.equal(await iv.encodeAvif(big, { sharp: fakeSharp({ out: Buffer.alloc(950) }), isBusy: notBusy }), null, "not 10% smaller: skipped");
  assert.equal(await iv.encodeAvif(big, { sharp: fakeSharp({ pages: 3 }), isBusy: notBusy }), null, "multi-page input skipped");
  const prevWarn = console.warn;
  console.warn = () => {};
  assert.equal(await iv.encodeAvif(big, { sharp: fakeSharp({ fail: true }), isBusy: notBusy }), null, "encoder error: null, no throw");
  console.warn = prevWarn;
  assert.equal(await iv.encodeAvif(big, { sharp: fakeSharp(), isBusy: () => true }), null, "busy server: no encode");
  assert.equal(await iv.encodeAvif(Buffer.alloc(0), { sharp: fakeSharp(), isBusy: notBusy }), null);
  assert.equal(await iv.encodeAvif(Buffer.alloc(iv.MAX_INPUT_BYTES + 1), { sharp: fakeSharp(), isBusy: notBusy }), null, "too large");
  process.env.MEDIA_AVIF = "off";
  assert.equal(await iv.encodeAvif(big, { sharp: fakeSharp(), isBusy: notBusy }), null, "MEDIA_AVIF=off");
  delete process.env.MEDIA_AVIF;

  // one at a time: a second caller waits; with waitMs 0 it gives up at once
  const slow = fakeSharp({ delayMs: 80 });
  const first = iv.encodeAvif(big, { sharp: slow, isBusy: notBusy });
  const skipped = await iv.encodeAvif(big, { sharp: slow, isBusy: notBusy, waitMs: 0 });
  assert.equal(skipped, null, "no wait budget while busy: skipped");
  const second = iv.encodeAvif(big, { sharp: slow, isBusy: notBusy, waitMs: 2000 });
  const [a, b] = await Promise.all([first, second]);
  assert.ok(a && b, "queued encode runs after the first");
  // queue full -> immediate null
  const many = [];
  for (let i = 0; i < 8; i++) many.push(iv.encodeAvif(big, { sharp: fakeSharp({ delayMs: 20 }), isBusy: notBusy, waitMs: 5000 }));
  const res = await Promise.all(many);
  assert.ok(res.filter(Boolean).length >= 7 && res.filter((x) => x === null).length >= 1, "a full queue refuses instead of piling up");
  // a waiter that times out does not keep the slot
  const hold = iv.encodeAvif(big, { sharp: fakeSharp({ delayMs: 120 }), isBusy: notBusy });
  assert.equal(await iv.encodeAvif(big, { sharp: fakeSharp(), isBusy: notBusy, waitMs: 20 }), null, "wait budget expires");
  await hold;
  assert.ok(await iv.encodeAvif(big, { sharp: fakeSharp(), isBusy: notBusy, waitMs: 0 }), "slot is free again");

  // ── missing-sibling memory ──────────────────────────────────────────────
  iv._resetForTests();
  const t0 = 1_000_000;
  iv.noteMissing("images/x-av1.avif", t0);
  assert.equal(iv.knownMissing("images/x-av1.avif", t0 + 1000), true);
  assert.equal(iv.knownMissing("images/x-av1.avif", t0 + 3 * 60 * 1000), false, "first miss is short");
  iv.noteMissing("images/x-av1.avif", t0 + 3 * 60 * 1000);
  assert.equal(iv.knownMissing("images/x-av1.avif", t0 + 30 * 60 * 1000), true, "second miss lasts longer");
  iv.forgetMissing("images/x-av1.avif");
  assert.equal(iv.knownMissing("images/x-av1.avif", t0 + 30 * 60 * 1000), false);

  // ── real sharp (installed in CI as an optional backend dependency) ──────
  iv._resetForTests();
  const sharp = iv.loadSharp();
  if (!sharp) {
    console.log("imageVariants: sharp not installed here, real AVIF encode check skipped");
  } else {
    const src = png(640, 480);
    const out = await iv.encodeAvif(src, { profile: "avatar", isBusy: notBusy });
    assert.ok(out, "real encode produced an AVIF");
    const meta = await sharp(out.buffer).metadata();
    assert.equal(meta.format, "heif", "AVIF container");
    assert.equal(meta.compression, "av1");
    assert.equal(Math.max(meta.width, meta.height), 512, "downscaled to the avatar cap");
    assert.equal(meta.hasAlpha, true, "transparency kept");
    assert.ok(out.buffer.length < src.length * 0.9, `smaller (${out.buffer.length} < ${src.length})`);
    console.log(`imageVariants: real AVIF ${src.length} -> ${out.buffer.length} bytes`);
  }
  iv._resetForTests();
  console.log("imageVariants: all checks passed");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
