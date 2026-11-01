// Windows discrete-GPU opt-in for the 3D world (electron/gpuPreference.cjs).
// Run: node electron/gpuPreference.selftest.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const require = createRequire(import.meta.url);
const gpu = require("./gpuPreference.cjs");

// decision
assert.equal(gpu.shouldForceHighPerformanceGpu({ platform: "win32", marker: { highPerformance: true } }), true);
assert.equal(gpu.shouldForceHighPerformanceGpu({ platform: "win32", marker: null }), false, "nobody opened the world: no switch");
assert.equal(gpu.shouldForceHighPerformanceGpu({ platform: "darwin", marker: { highPerformance: true } }), false, "Windows only");
assert.equal(gpu.shouldForceHighPerformanceGpu({ platform: "win32", smoke: true, marker: { highPerformance: true } }), false, "smoke runs stay on software GL");

// marker round trip
const dir = mkdtempSync(path.join(os.tmpdir(), "descall-gpu-"));
try {
  assert.equal(gpu.readMarker(dir, { fs, path }), null);
  assert.equal(gpu.writeMarker(dir, { fs, path, now: 5 }), true);
  assert.deepEqual(JSON.parse(readFileSync(path.join(dir, gpu.MARKER), "utf8")), { highPerformance: true, since: 5 });
  assert.equal(gpu.writeMarker(dir, { fs, path, now: 9 }), false, "written once");
  // applied before ready
  const switches = [];
  const app = { getPath: () => dir, commandLine: { appendSwitch: (s) => switches.push(s) } };
  assert.equal(gpu.applyWorldGpuPreference({ app, fs, path, platform: "win32" }), true);
  assert.deepEqual(switches, ["force_high_performance_gpu"]);
  assert.equal(gpu.applyWorldGpuPreference({ app, fs, path, platform: "linux" }), false);
  // a broken file is ignored
  fs.writeFileSync(path.join(dir, gpu.MARKER), "{oops");
  assert.equal(gpu.readMarker(dir, { fs, path }), null);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// main.cjs wiring: applied before ready, pointer lock allowed for first-person look
const main = readFileSync(new URL("./main.cjs", import.meta.url), "utf8");
assert.match(main, /applyWorldGpuPreference\(/);
assert.match(main, /'world3d:prefer-high-performance-gpu'/);
assert.match(main, /MEDIA_PERMISSIONS = \[[^\]]*'pointerLock'/, "pointer lock permission for the 3D world's first-person camera");
const preload = readFileSync(new URL("./preload.cjs", import.meta.url), "utf8");
assert.match(preload, /world3dPreferHighPerformanceGpu/);

console.log("gpuPreference selftest ok");
