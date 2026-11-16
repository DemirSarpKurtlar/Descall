/**
 * One-frame flash fix for framer-motion's hardware-accelerated animations
 * (owner report, Nov 2026: "black flicker when Settings and most menus open
 * or close").
 *
 * framer-motion 11 runs opacity / transform / filter / clip-path through the
 * Web Animations API (AcceleratedAnimation). When such an animation finishes
 * it calls `motionValue.set(final)`, which only schedules the inline style
 * write for the next frameloop batch, and then `animation.cancel()` at once.
 * Cancelling removes the animation's effect, so for at least one painted
 * frame the element shows its stale inline style:
 *   - open: the inline value is still the `initial` (opacity 0), so the
 *     scrim and the card vanish for a frame after fading in;
 *   - close: the inline value is the old resting one (opacity 1), so a
 *     scrim that has just faded out pops back at full dark for a frame
 *     before AnimatePresence unmounts it: the black flash.
 * The same happens when an animation is interrupted (`stop()`: open, then
 * close quickly).
 *
 * Fix: for animations started by framer-motion, write the animation's
 * current value into the inline style (`commitStyles()`) right before it is
 * cancelled, so the element never falls back to the stale value. framer then
 * writes the same value on its next batch. Nothing else in the app calls
 * Element.animate, and only framer's option shape is matched, so other WAAPI
 * users keep the standard cancel (revert) behaviour.
 *
 * Test: src/lib/waapiCommitOnCancel.selftest.mjs
 */

const PATCHED = "__descallWaapiCommit";

/** framer-motion's startWaapiAnimation always passes exactly this shape. */
export function isFramerWaapiOptions(options) {
  return (
    !!options &&
    typeof options === "object" &&
    options.fill === "both" &&
    "delay" in options &&
    "duration" in options &&
    "easing" in options &&
    "iterations" in options &&
    "direction" in options
  );
}

/** Wrap one Animation's cancel() so it commits its current value first. */
export function commitBeforeCancel(animation) {
  if (!animation || typeof animation.cancel !== "function" || animation[PATCHED]) return animation;
  if (typeof animation.commitStyles !== "function") return animation;
  const cancel = animation.cancel;
  animation.cancel = function cancelWithCommit() {
    try {
      const target = this.effect && this.effect.target;
      // commitStyles throws on an element that is not rendered (detached,
      // display: none); then the plain cancel is all that can be done.
      if (this.playState !== "idle" && target && target.isConnected !== false) this.commitStyles();
    } catch {
      /* not rendered: nothing on screen to flash */
    }
    return cancel.call(this);
  };
  animation[PATCHED] = true;
  return animation;
}

/** Install once, before the first framer animation runs (main.jsx). */
export function installWaapiCommitOnCancel(win = typeof window !== "undefined" ? window : undefined) {
  const proto = win && win.Element && win.Element.prototype;
  if (!proto || typeof proto.animate !== "function" || proto.animate[PATCHED]) return false;
  const original = proto.animate;
  const animate = function animate(keyframes, options) {
    const animation = original.call(this, keyframes, options);
    return isFramerWaapiOptions(options) ? commitBeforeCancel(animation) : animation;
  };
  animate[PATCHED] = true;
  proto.animate = animate;
  return true;
}
