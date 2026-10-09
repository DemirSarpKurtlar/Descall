import { useCallback, useEffect, useRef } from "react";
import { createValueAnimator } from "../lib/fluid/animator";
import { SPRINGS } from "../lib/fluid/springs";
import { hapticLight } from "../lib/haptics";

const PRESSED_SCALE = 0.97;
/** Finger may wander this far outside the target before the press is released (apple-design.md §10). */
const HYSTERESIS_PX = 10;

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Instant press feedback (apple-design.md §1, §10):
 *   - reacts on pointer-down (never on click / touch-up), in the same frame
 *   - scale 0.97 + `data-pressed` (CSS brightens the material)
 *   - release springs back from the live scale (interruptible, no jump)
 *   - dragging > 10 px outside the target releases the highlight; back in → pressed again
 *   - reduced motion: no scale, only the `data-pressed` highlight
 *   - optional light haptic on press (only where it earns its place)
 *
 * Usage: const press = usePressFeedback(); <button {...press} /> (spread the returned handlers + ref).
 * The click / submit itself is untouched — this is visual only.
 */
export function usePressFeedback({ disabled = false, haptic = false, scale = PRESSED_SCALE } = {}) {
  const elRef = useRef(null);
  const animRef = useRef(null);
  const activeRef = useRef(null); // pointerId
  const insideRef = useRef(false);

  const animator = useCallback(() => {
    if (!animRef.current) {
      animRef.current = createValueAnimator(
        1,
        (v) => {
          const el = elRef.current;
          if (!el) return;
          el.style.transform = Math.abs(v - 1) < 0.0005 ? "" : `scale(${v.toFixed(4)})`;
        },
        { scale: 0.001 }
      );
    }
    return animRef.current;
  }, []);

  const setPressed = useCallback(
    (pressed) => {
      const el = elRef.current;
      if (!el) return;
      if (pressed) el.setAttribute("data-pressed", "");
      else el.removeAttribute("data-pressed");
      if (prefersReducedMotion()) return;
      animator().to(pressed ? scale : 1, { preset: pressed ? { dampingRatio: 1, response: 0.1 } : SPRINGS.press });
    },
    [animator, scale]
  );

  const onPointerDown = useCallback(
    (e) => {
      if (disabled || e.button > 0) return;
      const el = elRef.current;
      if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") return;
      activeRef.current = e.pointerId;
      insideRef.current = true;
      setPressed(true);
      if (haptic) hapticLight();
    },
    [disabled, haptic, setPressed]
  );

  const onPointerMove = useCallback(
    (e) => {
      if (activeRef.current !== e.pointerId) return;
      const el = elRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const inside =
        e.clientX >= r.left - HYSTERESIS_PX &&
        e.clientX <= r.right + HYSTERESIS_PX &&
        e.clientY >= r.top - HYSTERESIS_PX &&
        e.clientY <= r.bottom + HYSTERESIS_PX;
      if (inside !== insideRef.current) {
        insideRef.current = inside;
        setPressed(inside);
      }
    },
    [setPressed]
  );

  const release = useCallback(
    (e) => {
      if (activeRef.current === null || (e && activeRef.current !== e.pointerId)) return;
      activeRef.current = null;
      insideRef.current = false;
      setPressed(false);
    },
    [setPressed]
  );

  useEffect(() => () => animRef.current?.stop(), []);

  return {
    ref: elRef,
    onPointerDown,
    onPointerMove,
    onPointerUp: release,
    onPointerCancel: release,
    onLostPointerCapture: release,
  };
}

export default usePressFeedback;

const SCOPE_SELECTOR = "[data-press], button, a[href], [role='button'], [role='tab']";

/**
 * Delegated press feedback for every pressable inside a container (glass
 * screens retrofit whole subtrees — sub-flows like Forgot password, social
 * sign-up and legal links get the same instant response without touching
 * each component). Opt out with data-press="off". Same physics as
 * usePressFeedback; one spring per element, created lazily.
 */
export function usePressFeedbackScope(containerRef, { enabled = true, scale = PRESSED_SCALE } = {}) {
  useEffect(() => {
    const root = containerRef.current;
    if (!enabled || !root) return undefined;
    const springs = new WeakMap();
    let active = null; // { el, pointerId, inside }

    const animFor = (el) => {
      let a = springs.get(el);
      if (!a) {
        a = createValueAnimator(
          1,
          (v) => {
            el.style.transform = Math.abs(v - 1) < 0.0005 ? "" : `scale(${v.toFixed(4)})`;
          },
          { scale: 0.001 }
        );
        springs.set(el, a);
      }
      return a;
    };
    const setPressed = (el, pressed) => {
      if (pressed) el.setAttribute("data-pressed", "");
      else el.removeAttribute("data-pressed");
      if (prefersReducedMotion()) return;
      const s = Number(el.getAttribute("data-press-scale")) || scale;
      animFor(el).to(pressed ? s : 1, { preset: pressed ? { dampingRatio: 1, response: 0.1 } : SPRINGS.press });
    };
    const onDown = (e) => {
      if (e.button > 0) return;
      const el = e.target?.closest?.(SCOPE_SELECTOR);
      if (!el || !root.contains(el) || el.getAttribute("data-press") === "off") return;
      if (el.disabled || el.getAttribute("aria-disabled") === "true") return;
      active = { el, pointerId: e.pointerId, inside: true };
      setPressed(el, true);
    };
    const onMove = (e) => {
      if (!active || active.pointerId !== e.pointerId) return;
      const r = active.el.getBoundingClientRect();
      const inside =
        e.clientX >= r.left - HYSTERESIS_PX &&
        e.clientX <= r.right + HYSTERESIS_PX &&
        e.clientY >= r.top - HYSTERESIS_PX &&
        e.clientY <= r.bottom + HYSTERESIS_PX;
      if (inside !== active.inside) {
        active.inside = inside;
        setPressed(active.el, inside);
      }
    };
    const onUp = (e) => {
      if (!active || active.pointerId !== e.pointerId) return;
      const { el } = active;
      active = null;
      setPressed(el, false);
    };
    root.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    return () => {
      root.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (active) active.el.removeAttribute("data-pressed");
      active = null;
    };
  }, [containerRef, enabled, scale]);
}
