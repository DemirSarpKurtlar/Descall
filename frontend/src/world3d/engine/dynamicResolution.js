/**
 * Dynamic resolution for the 3D world (pure, no Babylon).
 *
 * The quality preset decides which effects exist (bloom, MSAA, depth of field, mirror
 * floor); this controller never touches them. When the frame rate cannot hold the
 * 60 fps target it lowers the render scale in small steps, and raises it again when
 * there is headroom. Changing the scale only resizes render targets: no shader is
 * compiled, so a step never hitches.
 *
 * Signal: the GPU frame time when the browser exposes a timer query
 * (EXT_disjoint_timer_query_webgl2), otherwise the frame interval. With vsync an
 * interval cannot show headroom (a fast GPU still waits for the 16.7 ms tick), so
 * without a GPU timer the controller probes one step up after a long calm period and
 * backs off (doubling the wait) when the probe has to be undone.
 *
 * Hysteresis: down needs most of ~0.9 s to be slow, up needs ~4 s of clear headroom
 * (GPU timer) or 8 s+ without a slow frame (probe), and every change starts a cooldown.
 *
 * CPU-bound frames: without a GPU timer a slow interval can also be JavaScript. When a
 * step down does not make the frames at least 7 % shorter, the step is undone and the
 * controller holds for a while instead of blurring the picture for nothing.
 */

export const TARGET_FPS = 60;
export const DEFAULT_LEVELS = Object.freeze([1, 0.9, 0.8, 0.72, 0.64, 0.57, 0.5]);

/** Frames longer than this are pauses (tab switch, GC, alert), not a GPU signal. */
const IGNORE_MS = 250;

export function createResolutionController({
  targetMs = 1000 / TARGET_FPS,
  levels = DEFAULT_LEVELS,
  slowFactor = 1.12, // 18.7 ms at 60 fps: about 53 fps
  fastFactor = 0.7, // GPU under 11.7 ms: room for the next step up
  downWindowMs = 900,
  downSlowShare = 0.6,
  upWindowMs = 4000,
  cooldownMs = 1200,
  probeAfterMs = 8000,
  probeFailMs = 4000,
  maxProbeAfterMs = 64000,
  cpuHoldMs = 10000,
  startLevel = 0,
} = {}) {
  let level = Math.max(0, Math.min(levels.length - 1, startLevel));
  let locked = null;
  let lastChange = -Infinity;
  let probeAt = -Infinity;
  let probeWait = probeAfterMs;
  // accumulators since the last decision
  let winStart = null;
  let total = 0;
  let slow = 0;
  let gpuTotal = 0;
  let gpuFrames = 0;
  let gpuFastSince = null;
  let calmSince = null;
  let changes = 0;
  let frames = 0;
  let check = null; // { avgBefore } after an interval-driven step down
  let downBlockedUntil = -Infinity;

  function resetWindow(now) {
    winStart = now;
    total = 0;
    slow = 0;
    frames = 0;
    gpuTotal = 0;
    gpuFrames = 0;
  }

  function set(next, now, reason) {
    if (next === level) return null;
    level = next;
    lastChange = now;
    changes += 1;
    resetWindow(now);
    gpuFastSince = null;
    calmSince = now;
    if (reason === "probe") probeAt = now;
    return levels[level];
  }

  return {
    /**
     * One frame. intervalMs: time since the previous frame; gpuMs: GPU time of a recent
     * frame or null. Returns the new scale when it changed, otherwise null.
     */
    push(intervalMs, now, gpuMs = null) {
      if (locked != null) return null;
      if (winStart == null) resetWindow(now);
      if (calmSince == null) calmSince = now;
      if (!(intervalMs > 0) || intervalMs > IGNORE_MS) {
        // a pause: start over, it says nothing about the GPU
        resetWindow(now);
        calmSince = now;
        gpuFastSince = null;
        return null;
      }
      const hasGpu = Number.isFinite(gpuMs) && gpuMs > 0;
      const cost = hasGpu ? gpuMs : intervalMs;
      total += intervalMs;
      frames += 1;
      const isSlow = cost > targetMs * slowFactor;
      if (isSlow) {
        slow += intervalMs;
        calmSince = now;
      }
      if (hasGpu) {
        gpuTotal += gpuMs;
        gpuFrames += 1;
        if (gpuMs < targetMs * fastFactor) {
          if (gpuFastSince == null) gpuFastSince = now;
        } else {
          gpuFastSince = null;
        }
      }
      const cooling = now - lastChange < cooldownMs;
      // down: most of the last window was slow
      if (total >= downWindowMs) {
        const share = slow / total;
        const avg = total / Math.max(1, frames);
        resetWindow(now);
        if (check) {
          const before = check.avgBefore;
          check = null;
          if (avg > before * 0.93 && level > 0) {
            // lowering the resolution did not help: the frames are CPU-bound
            downBlockedUntil = now + cpuHoldMs;
            const scale = set(level - 1, now, "undo");
            calmSince = now;
            return scale;
          }
        }
        if (!cooling && now >= downBlockedUntil && share >= downSlowShare && level < levels.length - 1) {
          // a probe that had to be undone quickly: wait twice as long before the next one
          if (now - probeAt < probeFailMs) probeWait = Math.min(maxProbeAfterMs, probeWait * 2);
          if (!hasGpu) check = { avgBefore: avg };
          return set(level + 1, now, "down");
        }
      }
      if (cooling || level === 0) return null;
      // up with a GPU timer: steady headroom
      if (hasGpu && gpuFastSince != null && now - gpuFastSince >= upWindowMs) return set(level - 1, now, "up");
      // up without a GPU timer: probe after a long calm period
      if (!hasGpu && now - calmSince >= probeWait) return set(level - 1, now, "probe");
      return null;
    },
    /** Forced step down (perf probe, tests). Returns the new scale or null at the floor. */
    stepDown(now) {
      if (level >= levels.length - 1) return null;
      return set(level + 1, now, "down");
    },
    /** A pause (hidden window, manual stepping): forget the window, keep the level. */
    reset(now) {
      resetWindow(now);
      check = null;
      calmSince = now;
      gpuFastSince = null;
    },
    lock(scale) {
      locked = scale == null ? null : scale;
    },
    get scale() {
      return locked != null ? locked : levels[level];
    },
    get level() {
      return level;
    },
    get locked() {
      return locked != null;
    },
    get changes() {
      return changes;
    },
    get probeWait() {
      return probeWait;
    },
  };
}

/**
 * Hardware scaling level for Babylon (engine.setHardwareScalingLevel) from the device
 * pixel ratio, the preset's cap and the controller's scale. Babylon renders
 * canvas CSS size / level pixels.
 */
export function hardwareScalingFor({ devicePixelRatio = 1, maxPixelRatio = 1, presetScale = 1, scale = 1 } = {}) {
  const dpr = Math.max(0.5, Number(devicePixelRatio) || 1);
  const ratio = Math.min(dpr, maxPixelRatio) * presetScale * scale;
  return 1 / Math.max(0.25, ratio);
}
