import { useCallback, useEffect, useMemo, useRef } from "react";
import { createDragController } from "../lib/fluid/drag";
import { createValueAnimator } from "../lib/fluid/animator";
import { SPRINGS } from "../lib/fluid/springs";

/**
 * 1-D draggable value with Apple fluid-interface behaviour (apple-design.md §2-6, §9):
 * pointer capture, grab offset kept, 10 px hysteresis, rubber-band past the
 * bounds, release → momentum projection to the nearest snap point → spring
 * that inherits the finger's velocity; grabbing it mid-flight starts from the
 * live value. Frames are written through `onFrame(value)` (DOM, not React state).
 *
 *   const drag = useDragSpring({ axis: "x", min: -200, max: 0, snapPoints: [-200, 0],
 *                                onFrame: (x) => (el.style.transform = `translateX(${x}px)`),
 *                                onSettle: (x) => …, preset: SPRINGS.flick });
 *   <div {...drag.bind} />
 */
export function useDragSpring({
  axis = "x",
  min = -Infinity,
  max = Infinity,
  snapPoints = null,
  initial = 0,
  dimension = 400,
  rubberBand = true,
  preset = SPRINGS.flick,
  onFrame,
  onRelease,
  onSettle,
  disabled = false,
} = {}) {
  const frameRef = useRef(onFrame);
  const releaseRef = useRef(onRelease);
  const settleRef = useRef(onSettle);
  frameRef.current = onFrame;
  releaseRef.current = onRelease;
  settleRef.current = onSettle;

  const animator = useMemo(() => createValueAnimator(initial, (v) => frameRef.current?.(v)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const controller = useMemo(
    () => createDragController({ min, max, snapPoints, dimension, rubberBand }),
    [min, max, snapPoints, dimension, rubberBand]
  );
  const pointerRef = useRef(null);

  const pick = useCallback((e) => (axis === "y" ? { main: e.clientY, cross: e.clientX } : { main: e.clientX, cross: e.clientY }), [axis]);

  const onPointerDown = useCallback(
    (e) => {
      if (disabled || e.button > 0) return;
      pointerRef.current = e.pointerId;
      const { main, cross } = pick(e);
      // Interruptible: freeze the running spring where it is and grab that value.
      animator.stop();
      controller.begin({ main, cross, t: e.timeStamp, liveValue: animator.value });
    },
    [animator, controller, disabled, pick]
  );

  const onPointerMove = useCallback(
    (e) => {
      if (pointerRef.current !== e.pointerId) return;
      const { main, cross } = pick(e);
      const r = controller.move({ main, cross, t: e.timeStamp });
      if (r.type === "lock") {
        try {
          e.currentTarget.setPointerCapture?.(e.pointerId);
        } catch {
          /* ignore */
        }
      } else if (r.type === "drag") {
        animator.set(r.value, e.timeStamp);
      } else if (r.type === "reject") {
        pointerRef.current = null;
      }
    },
    [animator, controller, pick]
  );

  const finish = useCallback(
    (e) => {
      if (pointerRef.current !== e.pointerId) return;
      pointerRef.current = null;
      const r = controller.end({ t: e.timeStamp });
      if (r.type !== "release") return;
      const target = releaseRef.current?.(r) ?? r.target;
      animator.to(target, { preset, velocity: r.velocity }).then((v) => settleRef.current?.(v));
    },
    [animator, controller, preset]
  );

  useEffect(() => () => animator.stop(), [animator]);

  const springTo = useCallback((target, opts) => animator.to(target, { preset, ...opts }), [animator, preset]);

  return {
    bind: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
      style: { touchAction: axis === "x" ? "pan-y" : "pan-x" },
    },
    springTo,
    get value() {
      return animator.value;
    },
  };
}

export default useDragSpring;
