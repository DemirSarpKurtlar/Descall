import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cameraVideoConstraints,
  captureFacingCamera,
  canFlipCamera,
  getPreferredFacing,
  nextFacing,
  setPreferredFacing,
  shouldMirrorLocal,
  tagCameraTrack,
  trackFacing,
} from "./cameraFacing.js";

const here = dirname(fileURLToPath(import.meta.url));
const track = (settings = {}, extra = {}) => ({ kind: "video", getSettings: () => settings, ...extra });

// Facing state + flip.
assert.equal(getPreferredFacing(), "user");
assert.equal(nextFacing("user"), "environment");
assert.equal(nextFacing("environment"), "user");
assert.equal(setPreferredFacing("environment"), "environment");
assert.equal(setPreferredFacing("bogus"), "user");

// Constraints: device wins; facing hint otherwise; exact only for a flip.
assert.deepEqual(cameraVideoConstraints({ deviceId: "cam-2" }), { deviceId: { exact: "cam-2" }, width: { ideal: 1280 }, height: { ideal: 720 } });
assert.deepEqual(cameraVideoConstraints(), { width: 1280, height: 720, facingMode: "user" }, "default unchanged from 2.13");
assert.deepEqual(cameraVideoConstraints({ facing: "environment", exact: true }).facingMode, { exact: "environment" });

// Mirror: front only.
assert.equal(shouldMirrorLocal(track({ facingMode: "user" })), true, "front camera mirrored locally");
assert.equal(shouldMirrorLocal(track({ facingMode: "environment" })), false, "back camera never mirrored");
assert.equal(shouldMirrorLocal(track({})), true, "desktop webcam (no facingMode) is a front camera");
assert.equal(shouldMirrorLocal(tagCameraTrack(track({}), "environment")), false, "asked for the back camera, browser silent → not mirrored");
assert.equal(shouldMirrorLocal(track({ facingMode: "user" }, { __descallFacing: "environment" })), true, "the live setting wins over the tag");
assert.equal(shouldMirrorLocal(track({ displaySurface: "monitor" })), false, "a shared screen is never mirrored");
assert.equal(shouldMirrorLocal(track({}, { __descallRole: "screen" })), false);
assert.equal(shouldMirrorLocal(null), false);
assert.equal(shouldMirrorLocal({ kind: "audio" }), false);
assert.equal(trackFacing(track({ facingMode: "left" })), "environment");

// Flip availability.
assert.equal(canFlipCamera([{ kind: "videoinput" }]), false);
assert.equal(canFlipCamera([{ kind: "videoinput" }, { kind: "videoinput" }]), true);
assert.equal(canFlipCamera(null), false);

// Capture: exact first, then the hint on a single-camera device.
{
  const calls = [];
  const gum = async (c) => {
    calls.push(c.video.facingMode);
    if (typeof c.video.facingMode === "object") {
      const e = new Error("no such camera");
      e.name = "OverconstrainedError";
      throw e;
    }
    return { getVideoTracks: () => [track({})] };
  };
  const { track: t } = await captureFacingCamera(gum, "environment");
  assert.deepEqual(calls, [{ exact: "environment" }, "environment"]);
  assert.equal(t.__descallFacing, "environment");
  await assert.rejects(captureFacingCamera(async () => { const e = new Error("denied"); e.name = "NotAllowedError"; throw e; }, "user"), /denied/);
}

// Wiring: no hard-coded "user" facing left in the call hooks; mirror spots use the helper.
for (const f of ["../hooks/useCall.js", "../hooks/useGroupCall.js"]) {
  const src = readFileSync(join(here, f), "utf8");
  assert.ok(!src.includes('facingMode: "user"'), `${f}: facing comes from cameraFacing.js`);
  assert.ok(src.includes("flipCamera"), `${f}: exposes flipCamera`);
  assert.ok(src.includes("localMirror"), `${f}: exposes localMirror`);
}
const overlay = readFileSync(join(here, "../components/CallOverlay.jsx"), "utf8");
assert.ok(!overlay.includes('transform: isLocal ? "scaleX(-1)"'), "CallOverlay mirrors by facing, not by isLocal");
assert.ok(overlay.includes("call-flip-camera"), "single flip button");
const panel = readFileSync(join(here, "../components/servers/ServerVoicePanel.jsx"), "utf8");
assert.ok(panel.includes("shouldMirrorLocal(streamCameraTrack(cameraStream))"));

console.log("cameraFacing.selftest: ok");
