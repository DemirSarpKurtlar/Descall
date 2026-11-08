/**
 * Render smoke test: one real render through Chromium + ffmpeg, then checks duration,
 * resolution, codecs and the MP4 box order. Skipped when Playwright or ffmpeg is missing,
 * unless REQUIRE_RENDER=1 (CI sets it).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasBinary, probe, topLevelBoxes, validateVideoFile, ffmpegPath, ffprobePath } from "../lib/mp4.mjs";
import { loadPlaywright, renderReel } from "../lib/render/render.mjs";
import { buildTimeline } from "../lib/script.mjs";
import { loadScreenshotAllowlist } from "../lib/validator.mjs";
import { makeScript, policy } from "./fixtures.mjs";

function available() {
  try {
    loadPlaywright();
  } catch {
    return "playwright is not installed";
  }
  if (!hasBinary(ffmpegPath()) || !hasBinary(ffprobePath())) return "ffmpeg/ffprobe not found";
  return null;
}

const missing = available();
if (missing && process.env.REQUIRE_RENDER === "1") throw new Error(`render smoke test required but ${missing}`);

test("renders a Reel inside the Instagram spec", { skip: missing || false, timeout: 300000 }, async () => {
  const out = mkdtempSync(join(tmpdir(), "reel-smoke-"));
  try {
    const script = makeScript({
      id: "smoke",
      scenes: [
        { lines: ["Gürültü engelleme", "*varsayılan açık*"], visual: { type: "toggles", items: ["Gürültü engelleme", "Yankı engelleme"] } },
        { lines: ["Kısayollar"], visual: { type: "keys", items: [{ keys: "Ctrl+Shift+M", name: "Mikrofonu kapat / aç" }] } },
        { lines: ["Sunucular"], visual: { type: "screenshot", ref: "servers-ios" } },
      ],
    });
    const expected = buildTimeline(script).total;
    const r = await renderReel(script, { outDir: out, screenshots: loadScreenshotAllowlist(policy) });
    const check = validateVideoFile(r.video, { minSec: policy.limits.minDurationSec, maxSec: policy.limits.maxDurationSec });
    assert.deepEqual(check.errors, []);
    assert.equal(check.info.width, 1080);
    assert.equal(check.info.height, 1920);
    assert.ok(Math.abs(check.info.duration - expected) < 0.15, `duration ${check.info.duration} vs ${expected}`);
    assert.equal(Math.round(check.info.fps), 30);
    assert.equal(check.info.videoCodec, "h264");
    assert.equal(check.info.audioCodec, "aac");
    assert.equal(check.info.audioRate, 48000);
    const boxes = topLevelBoxes(r.video).map((b) => b.type);
    assert.equal(boxes[0], "ftyp");
    assert.ok(boxes.indexOf("moov") < boxes.indexOf("mdat"), boxes.join(","));
    assert.ok(check.info.size < 20 * 1024 * 1024, `video is ${check.info.size} bytes`);
    // Cover: a 1080x1920 JPEG.
    const jpg = readFileSync(r.cover);
    assert.equal(jpg[0], 0xff);
    assert.equal(jpg[1], 0xd8);
    const c = probe(r.cover).streams[0];
    assert.deepEqual([c.width, c.height], [1080, 1920]);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
