import { createSpring } from "./physics.js";
import { SPRINGS, physicsSpring } from "./springs.js";

/**
 * One animated scalar driven by an interruptible spring (apple-design.md §3-5).
 *
 * - `to()` always starts from the *current presentation value and velocity*,
 *   so retargeting mid-flight never jumps and never hits a velocity "brick wall".
 * - `set()` follows a finger 1:1 (and records velocity for the release handoff).
 * - Frames are display-synced (requestAnimationFrame) and written straight to the
 *   DOM through `onUpdate` — no React render per frame.
 *
 * `scale` = rough magnitude of the value (px → 1, scale/opacity → 0.001) so the
 * spring knows when it is "at rest".
 */
export function createValueAnimator(initial, onUpdate, { scale = 1 } = {}) {
  let value = initial;
  let velocity = 0; // units per ms
  let spring = null;
  let raf = 0;
  let last = 0;
  let resolveDone = null;
  let lastSetT = 0;
  const raf_ = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb) => setTimeout(() => cb(Date.now()), 16);
  const caf_ = typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : clearTimeout;

  const emit = () => {
    try {
      onUpdate?.(value);
    } catch {
      /* a detached element must never break the loop */
    }
  };

  const finish = () => {
    raf = 0;
    spring = null;
    const r = resolveDone;
    resolveDone = null;
    r?.(value);
  };

  const tick = (t) => {
    if (!spring) return finish();
    const dt = last ? Math.min(64, Math.max(0, t - last)) : 16;
    last = t;
    value = spring.step(dt);
    velocity = spring.velocity;
    emit();
    if (spring.done) {
      velocity = 0;
      finish();
    } else {
      raf = raf_(tick);
    }
  };

  return {
    get value() {
      return value;
    },
    get velocity() {
      return velocity;
    },
    get animating() {
      return Boolean(spring);
    },
    /** Jump (gesture tracking). Velocity is estimated from successive sets. */
    set(next, now = typeof performance !== "undefined" ? performance.now() : Date.now()) {
      if (raf) caf_(raf);
      raf = 0;
      spring = null;
      const dt = lastSetT ? now - lastSetT : 0;
      velocity = dt > 0 && dt < 100 ? (next - value) / dt : 0;
      lastSetT = now;
      value = next;
      emit();
      const r = resolveDone;
      resolveDone = null;
      r?.(value);
    },
    /** Spring to `target`. Options: preset (SPRINGS.*), velocity (units/ms) for the handoff. */
    to(target, { preset = SPRINGS.default, velocity: handoff } = {}) {
      const { response, dampingRatio } = physicsSpring(preset);
      spring = createSpring({
        from: value,
        to: target,
        velocity: Number.isFinite(handoff) ? handoff : velocity,
        response,
        dampingRatio,
        restDelta: 0.5 * scale,
        restSpeed: 0.02 * scale,
      });
      lastSetT = 0;
      if (spring.done) {
        value = target;
        velocity = 0;
        emit();
        finish();
        return Promise.resolve(value);
      }
      if (!raf) {
        last = 0;
        raf = raf_(tick);
      }
      return new Promise((resolve) => {
        const prev = resolveDone;
        resolveDone = (v) => {
          prev?.(v);
          resolve(v);
        };
      });
    },
    stop() {
      if (raf) caf_(raf);
      raf = 0;
      spring = null;
      velocity = 0;
    },
  };
}
