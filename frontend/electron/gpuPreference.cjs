'use strict';

/**
 * Discrete GPU for the 3D world on Windows dual-GPU laptops.
 *
 * Chromium on Windows picks one adapter for the whole GPU process at startup, so the
 * WebGL `powerPreference: "high-performance"` of the world cannot move it to the
 * discrete GPU by itself. `force_high_performance_gpu` does, but it also keeps the
 * discrete GPU awake while Descall sits in the tray, which costs battery for everyone
 * who never opens the world. So it is opt-in by use: the first time someone opens the
 * 3D world (admins only today) the renderer asks for it, a marker file is written to
 * userData, and from the next launch on the switch is applied. Smoke / software runs
 * never get it. Nothing in a normal run forces software or low-power rendering.
 */

const MARKER = 'world3d-gpu.json';

function markerPath(userDataDir, path) {
  return path.join(userDataDir, MARKER);
}

/** Pure decision (selftest). */
function shouldForceHighPerformanceGpu({ platform, smoke = false, marker = null } = {}) {
  if (platform !== 'win32' || smoke) return false;
  return Boolean(marker && marker.highPerformance === true);
}

function readMarker(userDataDir, { fs, path }) {
  try {
    const raw = fs.readFileSync(markerPath(userDataDir, path), 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

function writeMarker(userDataDir, { fs, path, now = Date.now() }) {
  try {
    const file = markerPath(userDataDir, path);
    if (readMarker(userDataDir, { fs, path })?.highPerformance === true) return false;
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ highPerformance: true, since: now }));
    return true;
  } catch {
    return false;
  }
}

/** Call before app ready. Returns true when the switch was added. */
function applyWorldGpuPreference({ app, fs, path, platform = process.platform, smoke = false }) {
  try {
    const marker = readMarker(app.getPath('userData'), { fs, path });
    if (!shouldForceHighPerformanceGpu({ platform, smoke, marker })) return false;
    app.commandLine.appendSwitch('force_high_performance_gpu');
    return true;
  } catch {
    return false;
  }
}

module.exports = { MARKER, shouldForceHighPerformanceGpu, readMarker, writeMarker, applyWorldGpuPreference };
