/**
 * Spring presets in Apple's two designer parameters (apple-design.md §4):
 *   dampingRatio — 1.0 = critically damped (default), < 1 bounces
 *   response     — seconds to (roughly) reach the target; not a duration
 *
 * Bounce (ζ ≈ 0.8) is reserved for motion that a gesture threw (flick, sheet).
 */
export const SPRINGS = Object.freeze({
  /** Everyday UI: buttons, lenses, fades with movement. */
  default: Object.freeze({ dampingRatio: 1, response: 0.35 }),
  /** Repositioning (PiP-like moves, tab lens). */
  move: Object.freeze({ dampingRatio: 1, response: 0.4 }),
  /** Drawers / sheets released by a gesture. */
  sheet: Object.freeze({ dampingRatio: 0.8, response: 0.3 }),
  /** Anything the user flicked (carries momentum). */
  flick: Object.freeze({ dampingRatio: 0.8, response: 0.35 }),
  /** Press feedback release (fast, no overshoot). */
  press: Object.freeze({ dampingRatio: 1, response: 0.22 }),
  /** Glass surfaces materializing (blur + scale together). */
  materialize: Object.freeze({ dampingRatio: 1, response: 0.32 }),
});

/**
 * framer-motion spring options from (dampingRatio, response), unit mass:
 *   stiffness = (2π / response)²,  damping = 4π·ζ / response
 * Pass the gesture's release velocity (px/s) as `velocity` for the handoff.
 */
export function framerSpring(preset = SPRINGS.default, velocity) {
  const { dampingRatio, response } = preset;
  const r = Math.max(0.01, response);
  const out = {
    type: "spring",
    mass: 1,
    stiffness: (2 * Math.PI / r) ** 2,
    damping: (4 * Math.PI * dampingRatio) / r,
    restDelta: 0.01,
    restSpeed: 0.01,
  };
  if (Number.isFinite(velocity)) out.velocity = velocity;
  return out;
}

/** Options for lib/fluid/physics.createSpring (response in ms). */
export function physicsSpring(preset = SPRINGS.default) {
  return { dampingRatio: preset.dampingRatio, response: preset.response * 1000 };
}

/** Reduced motion: short cross-fade instead of any spring (apple-design.md §14). */
export const REDUCED_MOTION_FADE = Object.freeze({ type: "tween", duration: 0.2, ease: "easeOut" });
