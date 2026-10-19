"use strict";
// Voice notes are normalized to AAC/M4A so a note recorded on any client plays on every other
// (iOS cannot decode Electron's WebM/Opus). Encodes real WebM/Opus and MP4/Opus fixtures with
// the bundled ffmpeg, transcodes them and checks the result is an MP4 with an AAC track.
const assert = require("assert");
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vt = require("../lib/voiceTranscode");

(async () => {
  assert.strictEqual(vt.baseMime("audio/webm;codecs=opus"), "audio/webm");
  assert.strictEqual(vt.baseMime(" Audio/MP4 "), "audio/mp4");
  const args = vt.ffmpegArgs("in", "out.m4a");
  assert.ok(args.includes("aac") && args.includes("+faststart") && args.includes("mp4"));

  // Non-audio is left alone; a broken input keeps the original (never throws).
  const img = { mimetype: "image/png", buffer: Buffer.from("x"), originalname: "a.png" };
  assert.deepStrictEqual(await vt.normalizeVoiceUpload(img), { transcoded: false });
  const bad = { mimetype: "audio/webm", buffer: Buffer.from("not audio"), originalname: "v.webm", size: 9 };
  const r = await vt.normalizeVoiceUpload(bad);
  assert.strictEqual(r.transcoded, false);
  assert.strictEqual(bad.mimetype, "audio/webm");
  assert.strictEqual(bad.originalname, "v.webm");

  const bin = vt.ffmpegPath();
  if (spawnSync(bin, ["-version"]).status !== 0) {
    console.log("voiceTranscode: no ffmpeg binary, skipped encode checks");
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vt-test-"));
  const fixtures = [
    ["webm", ["-c:a", "libopus", "-f", "webm"], "audio/webm"],
    ["mp4", ["-c:a", "libopus", "-f", "mp4"], "audio/mp4"],
    ["m4a", ["-c:a", "aac", "-f", "mp4"], "audio/mp4"],
  ];
  for (const [ext, enc, mime] of fixtures) {
    const src = path.join(dir, `src.${ext}`);
    const gen = spawnSync(bin, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
      "sine=frequency=440:duration=2", ...enc, src]);
    if (gen.status !== 0) { console.log(`skip ${ext} fixture: ${gen.stderr}`); continue; }
    const file = { mimetype: mime, buffer: fs.readFileSync(src), originalname: `voice-1.${ext}` };
    const res = await vt.normalizeVoiceUpload(file);
    assert.strictEqual(res.transcoded, true, `${ext}: ${res.error}`);
    assert.strictEqual(file.mimetype, "audio/mp4");
    assert.strictEqual(file.originalname, "voice-1.m4a");
    assert.strictEqual(file.size, file.buffer.length);
    assert.strictEqual(file.buffer.slice(4, 8).toString("latin1"), "ftyp", `${ext}: not mp4`);
    // AAC track and moov before mdat (+faststart → playable while streaming on iOS).
    const head = file.buffer.toString("latin1");
    assert.ok(head.includes("mp4a"), `${ext}: no AAC track`);
    assert.ok(head.indexOf("moov") < head.indexOf("mdat"), `${ext}: moov not up front`);
    const probe = spawnSync(bin, ["-hide_banner", "-i", "pipe:0", "-f", "null", "-"], { input: file.buffer });
    assert.ok(/Audio: aac/.test(String(probe.stderr)), `${ext}: decoded codec is not aac`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log("voiceTranscode.unit.test ok");
})().catch((e) => { console.error(e); process.exit(1); });
