import { useRef } from "react";
import { swipeStep } from "../lib/shop2Swipe.js";

/**
 * Touch / pen swipe for a carousel. Spread the returned props on the swipe surface and give
 * it `touch-action: pan-y` so vertical page scrolling keeps working. Mouse drags are ignored
 * (desktop has the prev / next buttons and arrow keys).
 */
export function useShop2Swipe(onStep) {
  const start = useRef(null);
  const cb = useRef(onStep);
  cb.current = onStep;
  return {
    onPointerDown(e) {
      if (e.pointerType === "mouse" || !e.isPrimary) return;
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    },
    onPointerUp(e) {
      const s = start.current;
      start.current = null;
      if (!s || s.id !== e.pointerId) return;
      const step = swipeStep(e.clientX - s.x, e.clientY - s.y);
      if (step) cb.current?.(step);
    },
    onPointerCancel() {
      start.current = null;
    },
  };
}
