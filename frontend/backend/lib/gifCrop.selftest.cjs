"use strict";
// node frontend/backend/lib/gifCrop.selftest.cjs
const assert = require("assert/strict");
const { spawnSync } = require("child_process");
const { parseCrop, filterChain, cropGif, countGifFrames } = require("./gifCrop");
const { ffmpegPath } = require("./voiceTranscode");

assert.equal(parseCrop(null), null);
assert.equal(parseCrop("nope"), null);
assert.equal(parseCrop({ x: 0, y: 0, width: 4, height: 100 }), null, "too small");
assert.equal(parseCrop({ x: 0, y: 0, width: 100, height: 100, rotation: 45 }), null, "only quarter turns");
assert.equal(parseCrop({ x: -1, y: 0, width: 100, height: 100 }), null);
assert.deepEqual(parseCrop('{"x":10.4,"y":2,"width":200,"height":80,"rotation":-90}'), { x: 10, y: 2, width: 200, height: 80, rotation: 270 });
assert.equal(parseCrop("x".repeat(600)), null);

assert.match(filterChain({ x: 1, y: 2, width: 300, height: 300, rotation: 90 }), /^transpose=1,crop=300:300:1:2,scale=300:300/);
assert.match(filterChain({ x: 0, y: 0, width: 2000, height: 800, rotation: 0 }, "banner"), /scale=1200:480/);
assert.match(filterChain({ x: 0, y: 0, width: 1024, height: 1024, rotation: 180 }), /^transpose=1,transpose=1,crop=1024:1024:0:0,scale=512:512/);
assert.match(filterChain({ x: 0, y: 0, width: 100, height: 100, rotation: 0 }), /palettegen.*paletteuse/);

(async () => {
  const bin = ffmpegPath();
  const probe = spawnSync(bin, ["-version"], { stdio: "ignore" });
  if (probe.status !== 0) {
    console.log("gifCrop.selftest: ok (ffmpeg missing, real crop skipped)");
    return;
  }
  // 12-frame 160x120 animated test GIF.
  const src = spawnSync(bin, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=1.2", "-loop", "0", "-f", "gif", "pipe:1"], { maxBuffer: 1 << 24 });
  assert.equal(src.status, 0, "made source gif");
  const before = countGifFrames(src.stdout);
  assert.ok(before >= 10, `source has frames (${before})`);
  const out = await cropGif(src.stdout, { x: 20, y: 10, width: 100, height: 100, rotation: 0 });
  assert.equal(out.toString("ascii", 0, 3), "GIF");
  assert.equal(out.readUInt16LE(6), 100, "width");
  assert.equal(out.readUInt16LE(8), 100, "height");
  assert.equal(countGifFrames(out), before, "every frame kept (animation preserved)");
  const rot = await cropGif(src.stdout, { x: 0, y: 0, width: 120, height: 160, rotation: 90 });
  assert.equal(rot.readUInt16LE(6), 120);
  assert.equal(rot.readUInt16LE(8), 160);
  assert.equal(countGifFrames(rot), before);
  const wide = await cropGif(src.stdout, { x: 0, y: 30, width: 160, height: 64, rotation: 0 }, { target: "banner" });
  assert.equal(wide.readUInt16LE(6), 160);
  assert.equal(wide.readUInt16LE(8), 64);
  assert.ok(wide.includes(Buffer.from("NETSCAPE2.0")), "loops forever");
  console.log(`gifCrop.selftest: ok (${before} frames kept)`);
})().catch((e) => { console.error(e); process.exit(1); });
