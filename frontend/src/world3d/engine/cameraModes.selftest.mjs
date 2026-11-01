// Camera modes: state machine, preferences, blend, look, free-cam flight.
// Run: node src/world3d/engine/cameraModes.selftest.mjs
import assert from "node:assert/strict";
import {
  CAMERA_MODES,
  DEFAULT_CAMERA_PREFS,
  MODE_BLEND_MS,
  PITCH_LIMITS,
  applyLook,
  blendDone,
  blendWeight,
  createCameraState,
  cycleMode,
  damp,
  dampAngle,
  easeInOutCubic,
  headBob,
  loadCameraPrefs,
  lookDirection,
  modePolicy,
  nextMode,
  normalizePrefs,
  prefsKey,
  returnToAvatar,
  saveCameraPrefs,
  stepFreeCam,
  switchMode,
  zoomRadius,
} from "./cameraModes.js";

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

// --- cycle (V) and policies
assert.deepEqual(CAMERA_MODES, ["third", "first", "free"]);
assert.equal(nextMode("third"), "first");
assert.equal(nextMode("first"), "free");
assert.equal(nextMode("free"), "third");
assert.equal(nextMode("bogus"), "first", "unknown modes restart the cycle");
assert.deepEqual(modePolicy("third"), { clickToWalk: true, clickLocksPointer: false, dragOrbits: true, movesAvatar: true, hideOwnHead: false, flies: false });
assert.equal(modePolicy("first").clickToWalk, false, "click-to-walk is third person only");
assert.equal(modePolicy("first").clickLocksPointer, true, "a click locks the pointer in first person");
assert.equal(modePolicy("first").hideOwnHead, true);
assert.equal(modePolicy("free").movesAvatar, false, "the avatar stays put in free cam");
assert.equal(modePolicy("free").flies, true);

// --- state machine with blends
let s = createCameraState();
assert.equal(s.mode, "third");
assert.equal(blendWeight(s, 0), 1, "no blend at rest");
s = cycleMode(s, 1000);
assert.equal(s.mode, "first");
assert.deepEqual(s.blend, { from: "third", to: "first", start: 1000, duration: MODE_BLEND_MS });
near(blendWeight(s, 1000), 0);
near(blendWeight(s, 1000 + MODE_BLEND_MS / 2), 0.5);
near(blendWeight(s, 1000 + MODE_BLEND_MS), 1);
assert.equal(blendDone(s, 1000 + MODE_BLEND_MS - 1), false);
assert.equal(blendDone(s, 1000 + MODE_BLEND_MS), true);
let prev = -1;
for (let t = 0; t <= MODE_BLEND_MS; t += 25) {
  const w = blendWeight(s, 1000 + t);
  assert.ok(w >= prev, "blend weight never goes backwards");
  prev = w;
}
assert.equal(switchMode(s, "first", 2000), s, "same mode: unchanged");
assert.equal(switchMode(s, "nope", 2000), s, "unknown mode: unchanged");
s = cycleMode(s, 2000);
assert.equal(s.mode, "free");
assert.equal(s.lastAvatarMode, "first", "free cam remembers the avatar mode it left");
s = returnToAvatar(s, 3000);
assert.equal(s.mode, "first", "R returns to the mode used before flying");
assert.equal(s.blend.from, "free");
assert.equal(returnToAvatar(s, 3100), s, "R does nothing outside free cam");
s = switchMode(createCameraState("free"), "third", 0);
assert.equal(s.mode, "third");
assert.equal(createCameraState("free").lastAvatarMode, "third");
// easing endpoints and symmetry
near(easeInOutCubic(0), 0);
near(easeInOutCubic(1), 1);
near(easeInOutCubic(0.25) + easeInOutCubic(0.75), 1);
near(easeInOutCubic(-3), 0);
near(easeInOutCubic(7), 1);

// --- preferences (per user, localStorage in try/catch)
assert.deepEqual(normalizePrefs(null), DEFAULT_CAMERA_PREFS);
assert.deepEqual(normalizePrefs({ mode: "free", fov: 300, sensitivity: -2, invertY: "yes", headBob: true }), { mode: "free", fov: 100, sensitivity: 0.25, invertY: false, headBob: true });
assert.equal(normalizePrefs({ fov: "80" }).fov, 80);
assert.equal(normalizePrefs({ fov: "" }).fov, DEFAULT_CAMERA_PREFS.fov);
assert.equal(prefsKey(42), "descall:world3d:camera:42");
const mem = new Map();
const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
saveCameraPrefs(storage, "u1", { mode: "first", fov: 85, sensitivity: 1.4, invertY: true, headBob: false });
assert.deepEqual(loadCameraPrefs(storage, "u1"), { mode: "first", fov: 85, sensitivity: 1.4, invertY: true, headBob: false });
assert.deepEqual(loadCameraPrefs(storage, "u2"), DEFAULT_CAMERA_PREFS, "another user keeps the defaults");
mem.set(prefsKey("u3"), "{not json");
assert.deepEqual(loadCameraPrefs(storage, "u3"), DEFAULT_CAMERA_PREFS, "bad JSON falls back");
const throwing = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("quota"); } };
assert.deepEqual(loadCameraPrefs(throwing, "u1"), DEFAULT_CAMERA_PREFS, "storage errors fall back");
assert.equal(saveCameraPrefs(throwing, "u1", { mode: "free" }).mode, "free", "save errors are swallowed");
assert.deepEqual(loadCameraPrefs(undefined, "u1"), DEFAULT_CAMERA_PREFS);

// --- mouse look
let look = applyLook({ yaw: 0, pitch: 0 }, 100, 50, { sensitivity: 1 });
near(look.yaw, 0.22);
near(look.pitch, 0.11);
const inv = applyLook({ yaw: 0, pitch: 0 }, 0, 50, { sensitivity: 2, invertY: true });
near(inv.pitch, -0.22, 1e-9);
look = applyLook({ yaw: 0, pitch: 0 }, 0, 100000, {}, PITCH_LIMITS.first);
assert.equal(look.pitch, PITCH_LIMITS.first[1], "pitch is clamped");
const d = lookDirection(0, 0);
near(d.x, 0);
near(d.y, 0);
near(d.z, 1);
const down = lookDirection(Math.PI / 2, 0.5);
assert.ok(down.y < 0 && down.x > 0.8, "positive pitch looks down, yaw pi/2 looks along +x");
near(Math.hypot(down.x, down.y, down.z), 1);

// --- damping is frame-rate independent
const a = damp(damp(0, 1, 5, 1 / 120), 1, 5, 1 / 120);
const b = damp(0, 1, 5, 1 / 60);
near(a, b, 1e-9);
near(dampAngle(Math.PI - 0.1, -Math.PI + 0.1, 1000, 1), Math.PI + 0.1, 1e-6);

// --- free cam: smooth acceleration, braking, Shift, room clamp
const bounds = { minX: -2, maxX: 2, minY: 0, maxY: 3, minZ: -2, maxZ: 2 };
const fc = { pos: { x: 0, y: 1.5, z: 0 }, vel: { x: 0, y: 0, z: 0 } };
stepFreeCam(fc, { forward: 1, right: 0, up: 0, fast: false }, 0, 0, 1 / 60, bounds);
assert.ok(fc.vel.z > 0 && fc.vel.z < 0.5, "starts gently");
for (let i = 0; i < 60; i += 1) stepFreeCam(fc, { forward: 1, right: 0, up: 0, fast: false }, 0, 0, 1 / 60, bounds);
assert.ok(fc.vel.z > 2 || fc.pos.z >= 1.74, "reaches cruise speed or the wall");
assert.ok(fc.pos.z <= 2 - 0.25 + 1e-9, "clamped inside the room");
const fast = { pos: { x: -1.5, y: 1.5, z: -1.5 }, vel: { x: 0, y: 0, z: 0 } };
for (let i = 0; i < 20; i += 1) stepFreeCam(fast, { forward: 0, right: 1, up: 0, fast: true }, 0, 0, 1 / 60, null);
const slow = { pos: { x: -1.5, y: 1.5, z: -1.5 }, vel: { x: 0, y: 0, z: 0 } };
for (let i = 0; i < 20; i += 1) stepFreeCam(slow, { forward: 0, right: 1, up: 0, fast: false }, 0, 0, 1 / 60, null);
assert.ok(fast.vel.x > slow.vel.x * 1.8, "Shift is faster");
assert.ok(slow.vel.x > 0, "right is +x at yaw 0");
const up = { pos: { x: 0, y: 1, z: 0 }, vel: { x: 0, y: 0, z: 0 } };
for (let i = 0; i < 30; i += 1) stepFreeCam(up, { forward: 0, right: 0, up: 1, fast: false }, 0, 0, 1 / 60, bounds);
assert.ok(up.pos.y > 1.3, "E flies up");
for (let i = 0; i < 120; i += 1) stepFreeCam(up, { forward: 0, right: 0, up: 0, fast: false }, 0, 0, 1 / 60, bounds);
assert.ok(Math.abs(up.vel.y) < 0.01, "stops smoothly when released");
const floor = { pos: { x: 0, y: 0.5, z: 0 }, vel: { x: 0, y: -3, z: 0 } };
stepFreeCam(floor, { forward: 0, right: 0, up: -1, fast: true }, 0, 0, 0.5, bounds);
assert.equal(floor.pos.y, 0.25, "never below the floor margin");
assert.equal(floor.vel.y, 0, "velocity into a wall is dropped");

// --- head bob and zoom
near(headBob(1, 0).y, 0);
near(headBob(1, 0).x, 0);
assert.ok(Math.abs(headBob(Math.PI / 2, 1.35).y) < 0.04, "subtle");
assert.equal(zoomRadius(5, 100000), 9);
assert.equal(zoomRadius(5, -100000), 1.6);
assert.ok(zoomRadius(5, 100) > 5 && zoomRadius(5, -100) < 5);

console.log("cameraModes selftest ok");
