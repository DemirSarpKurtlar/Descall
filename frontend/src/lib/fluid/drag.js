import { clamp, computeVelocity, nearestSnap, rubberbandClamp, VELOCITY_WINDOW_MS } from "./physics.js";

/**
 * 1-D direct-manipulation controller (pure; DOM-free so it is unit-tested).
 * apple-design.md §2, §5, §6, §9, §10:
 *   - ~10 px hysteresis before the drag commits to its axis
 *   - 1:1 tracking that keeps the grab offset (value at grab + finger delta)
 *   - rubber-band past [min, max]
 *   - release: velocity from the last ~90 ms, momentum projection to the
 *     nearest snap point, velocity handed to the spring
 *   - grab mid-flight: starts from the live (presentation) value
 */
export function createDragController({
  min = -Infinity,
  max = Infinity,
  snapPoints = null,
  slop = 10,
  dimension = 400,
  rubberBand = true,
  decelerationRate = 0.998,
} = {}) {
  let phase = "idle"; // idle | pending | dragging
  let startMain = 0;
  let startCross = 0;
  let grabValue = 0;
  let value = 0;
  let samples = [];

  const push = (x, t) => {
    samples.push({ x, t });
    while (samples.length > 2 && t - samples[0].t > VELOCITY_WINDOW_MS * 2) samples.shift();
  };

  return {
    get phase() {
      return phase;
    },
    get value() {
      return value;
    },
    /** Finger down. `liveValue` = the element's current on-screen value (may be mid-animation). */
    begin({ main, cross = 0, t, liveValue = 0 }) {
      phase = "pending";
      startMain = main;
      startCross = cross;
      grabValue = liveValue;
      value = liveValue;
      samples = [];
      push(liveValue, t);
    },
    /** Returns { type: "none" | "lock" | "reject" | "drag", value }. */
    move({ main, cross = 0, t }) {
      if (phase === "idle") return { type: "none", value };
      const d = main - startMain;
      if (phase === "pending") {
        const ad = Math.abs(d);
        const ac = Math.abs(cross - startCross);
        if (ad < slop && ac < slop) return { type: "none", value };
        if (ac > ad) {
          phase = "idle";
          return { type: "reject", value };
        }
        phase = "dragging";
        // iOS hides the slop: tracking continues from where the finger is now.
        startMain = main;
        push(value, t);
        return { type: "lock", value };
      }
      const raw = grabValue + (main - startMain);
      value = rubberBand ? rubberbandClamp(raw, min, max, dimension) : clamp(raw, min, max);
      push(value, t);
      return { type: "drag", value };
    },
    /** Finger up. Returns { type: "tap" | "release", value, velocity (units/ms), target }. */
    end({ t } = {}) {
      if (phase !== "dragging") {
        const wasPending = phase === "pending";
        phase = "idle";
        return { type: wasPending ? "tap" : "none", value, velocity: 0, target: value };
      }
      phase = "idle";
      const lastSample = samples[samples.length - 1];
      const stale = lastSample && Number.isFinite(t) && t - lastSample.t > VELOCITY_WINDOW_MS;
      const velocity = stale ? 0 : computeVelocity(samples, VELOCITY_WINDOW_MS);
      let target = clamp(value, min, max);
      if (Array.isArray(snapPoints) && snapPoints.length) {
        target = nearestSnap(value, velocity, snapPoints, decelerationRate);
      }
      return { type: "release", value, velocity, target };
    },
    cancel() {
      phase = "idle";
      samples = [];
    },
  };
}
